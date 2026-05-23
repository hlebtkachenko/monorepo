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
  }
}
