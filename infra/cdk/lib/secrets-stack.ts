import { CfnOutput, RemovalPolicy, Stack, type StackProps } from "aws-cdk-lib"
import {
  Effect,
  PolicyStatement,
  AnyPrincipal,
  User,
} from "aws-cdk-lib/aws-iam"
import { Key } from "aws-cdk-lib/aws-kms"
import type { Construct } from "constructs"

/**
 * Shared (non-per-env) bootstrap stack for the secrets-management plane.
 *
 * Owns:
 *
 *   1. The KMS Customer-Managed Key that HashiCorp Vault on the Hostinger VPS
 *      uses for auto-unseal. Annual rotation, RETAIN on stack delete, and a
 *      resource-policy deny on `kms:ScheduleKeyDeletion` so a stray
 *      `cdk destroy` (or compromised admin) cannot orphan the Vault data.
 *
 *   2. The dedicated IAM user `vault-unseal-vps` that the Vault container
 *      authenticates as when calling KMS. Permissions scoped to the single
 *      Key ARN — never `Resource: *`. The user has no console access; only
 *      programmatic credentials, generated out-of-band by the operator via
 *      `aws iam create-access-key --user-name vault-unseal-vps` after the
 *      first deploy. Credentials live in macOS Keychain + paper-at-safe-deposit
 *      per `docs/plans/SECRETS-MIGRATION.md` § irreversible-ops register.
 *      Rotate the access key every 90 days.
 *
 * Deploy: `cdk deploy SecretsBootstrap` (manual; not part of the per-env
 * deploy workflow). Region eu-central-1, same as the rest of the AWS
 * footprint.
 *
 * See `docs/plans/SECRETS-MIGRATION.md` M1 + `docs/runbooks/VAULT-OPS.md`.
 */
export class SecretsStack extends Stack {
  readonly vaultUnsealKey: Key
  readonly vaultUnsealUser: User
  readonly vaultAwsAuthVerifierUser: User
  readonly vaultSsmSyncUser: User

  constructor(scope: Construct, id: string, props: StackProps) {
    super(scope, id, props)

    this.vaultUnsealKey = new Key(this, "VaultUnsealKey", {
      alias: "alias/monorepo-vault-unseal",
      description:
        "Auto-unseals HashiCorp Vault on the Hostinger KVM 2 VPS. Annual rotation. Deletion is denied by resource policy — orphaning this key strands the Vault data. See docs/plans/SECRETS-MIGRATION.md.",
      enableKeyRotation: true,
      removalPolicy: RemovalPolicy.RETAIN,
    })

    // Belt-and-suspenders on top of `removalPolicy: RETAIN`. RETAIN protects
    // against `cdk destroy`; this deny protects against a compromised admin
    // (or an absent-minded one) issuing `aws kms schedule-key-deletion`
    // directly. The deny applies to AnyPrincipal — including the root account.
    // Lifting the deny requires editing this stack file + a fresh deploy.
    this.vaultUnsealKey.addToResourcePolicy(
      new PolicyStatement({
        sid: "DenyScheduleKeyDeletion",
        effect: Effect.DENY,
        principals: [new AnyPrincipal()],
        actions: ["kms:ScheduleKeyDeletion"],
        resources: ["*"],
      }),
    )

    this.vaultUnsealUser = new User(this, "VaultUnsealVpsUser", {
      userName: "vault-unseal-vps",
    })

    // Scoped to the single Key — never `Resource: *`. `grantEncryptDecrypt`
    // emits `kms:Encrypt`, `kms:Decrypt`, `kms:ReEncrypt*`, `kms:GenerateDataKey*`
    // on the Key ARN. `kms:DescribeKey` is added separately because the
    // Vault `seal "awskms"` block calls DescribeKey at startup to verify the
    // key state before requesting any cryptographic operation.
    this.vaultUnsealKey.grantEncryptDecrypt(this.vaultUnsealUser)
    this.vaultUnsealUser.addToPolicy(
      new PolicyStatement({
        actions: ["kms:DescribeKey"],
        resources: [this.vaultUnsealKey.keyArn],
      }),
    )

    // ---- Vault AWS IAM Auth method verifier (M3) --------------------
    //
    // The Vault `aws auth` method needs an AWS credential of its own to
    // VERIFY the identity of incoming task-role auth requests (via
    // sts:GetCallerIdentity + iam:GetRole). This user is NOT the principal
    // tasks authenticate AS — tasks authenticate as their ECS task role.
    // It's the read-only verifier Vault uses to call AWS APIs.
    //
    // No KMS access; no Secrets Manager access; no SSM access. Only the
    // four AWS APIs Vault calls during identity verification.
    //
    // Access keys generated out-of-band via
    //   aws iam create-access-key --user-name vault-aws-auth-verifier
    // and stored in macOS Keychain. The keys are pasted into Vault via
    // `vault write auth/aws/config/client access_key=... secret_key=...`
    // and from then on live only inside Vault's encrypted storage.
    // Rotate every 90 days.
    this.vaultAwsAuthVerifierUser = new User(this, "VaultAwsAuthVerifierUser", {
      userName: "vault-aws-auth-verifier",
    })
    this.vaultAwsAuthVerifierUser.addToPolicy(
      new PolicyStatement({
        sid: "VaultAwsAuthVerifierIdentityChecks",
        actions: [
          "sts:GetCallerIdentity",
          "iam:GetUser",
          "iam:GetRole",
          "iam:GetInstanceProfile",
        ],
        // Verifier reads role/user/instance-profile metadata of any
        // principal that tries to authenticate. Scoping by ARN here would
        // require predicting future ECS task role ARNs at stack-build
        // time; the read-only nature of the actions makes `*` acceptable.
        resources: ["*"],
      }),
    )

    // ---- Vault → SSM sync user (M4) ----------------------------------
    //
    // Identity used by /usr/local/sbin/vault-to-ssm-sync on the VPS to
    // mirror Vault `platform/{staging,production}/{better-auth-secret,
    // resend-api-key}` into AWS SSM SecureString — the runtime cache that
    // ECS reads at task start via EcsSecret.fromSsmParameter.
    //
    // Permissions scoped to the 4 secret params + 2 heartbeat params, plus
    // kms:GenerateDataKey on the AWS-managed `alias/aws/ssm` key (default
    // SecureString encryption). No KMS access to the Vault auto-unseal CMK
    // (different blast radius). No ssm:DeleteParameter (a compromised key
    // can only overwrite values, never erase tracking history).
    //
    // Access keys generated out-of-band:
    //   aws iam create-access-key --user-name vault-ssm-sync
    // and stored in macOS Keychain + paper-at-safe-deposit. Rotate every
    // 90 days.
    this.vaultSsmSyncUser = new User(this, "VaultSsmSyncUser", {
      userName: "vault-ssm-sync",
    })

    const syncParamArns = [
      "staging/better-auth-secret",
      "staging/resend-api-key",
      "staging/sync-heartbeat",
      "production/better-auth-secret",
      "production/resend-api-key",
      "production/sync-heartbeat",
    ].map(
      (suffix) =>
        `arn:aws:ssm:${this.region}:${this.account}:parameter/monorepo/${suffix}`,
    )

    this.vaultSsmSyncUser.addToPolicy(
      new PolicyStatement({
        sid: "VaultSsmSyncWriteScopedParams",
        actions: ["ssm:PutParameter", "ssm:GetParameter"],
        resources: syncParamArns,
      }),
    )

    // SecureString uses the AWS-managed `alias/aws/ssm` key by default.
    // The principal that writes/reads a SecureString needs kms:GenerateDataKey
    // (on create/update) + kms:Decrypt (on read). Resource is `*` here
    // because AWS-managed-key resource policies do not accept Allow grants
    // from another principal's policy on a Resource-scoped statement — the
    // alias/aws/ssm key's own policy gates access by the underlying SSM API.
    // No customer-managed KMS key for SSM in scope at MVP.
    this.vaultSsmSyncUser.addToPolicy(
      new PolicyStatement({
        sid: "VaultSsmSyncKmsForSsmDefaultKey",
        actions: ["kms:GenerateDataKey", "kms:Decrypt"],
        resources: ["*"],
        conditions: {
          StringEquals: {
            "kms:ViaService": `ssm.${this.region}.amazonaws.com`,
          },
        },
      }),
    )

    new CfnOutput(this, "VaultUnsealKeyId", {
      value: this.vaultUnsealKey.keyId,
      description:
        'KMS Key ID for the `seal "awskms"` block in /srv/secrets/vault/config/vault.hcl on the VPS.',
    })

    new CfnOutput(this, "VaultUnsealKeyArn", {
      value: this.vaultUnsealKey.keyArn,
      description:
        "KMS Key ARN (for cross-account references, if ever needed).",
    })

    new CfnOutput(this, "VaultUnsealUserName", {
      value: this.vaultUnsealUser.userName,
      description:
        "IAM user name. Generate access keys with `aws iam create-access-key --user-name vault-unseal-vps` after this stack deploys; store output in macOS Keychain + paper-at-safe-deposit.",
    })

    new CfnOutput(this, "VaultAwsAuthVerifierUserName", {
      value: this.vaultAwsAuthVerifierUser.userName,
      description:
        "IAM user that Vault calls AWS as while verifying incoming ECS task-role auth requests (M3). Generate access keys with `aws iam create-access-key --user-name vault-aws-auth-verifier`; paste into Vault via `vault write auth/aws/config/client`. Rotate every 90 days.",
    })

    new CfnOutput(this, "VaultSsmSyncUserName", {
      value: this.vaultSsmSyncUser.userName,
      description:
        "IAM user that /usr/local/sbin/vault-to-ssm-sync on the VPS authenticates as while mirroring Vault → SSM SecureString every 5 min (M4). Generate access keys with `aws iam create-access-key --user-name vault-ssm-sync`; store in macOS Keychain + paper-at-safe-deposit. Rotate every 90 days.",
    })
  }
}
