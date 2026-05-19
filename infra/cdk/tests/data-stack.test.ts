import { Match, Template } from "aws-cdk-lib/assertions"
import { describe, expect, it } from "vitest"
import { buildTestApp } from "./helper.js"

describe("DataStack — Secrets Manager dual-user role split", () => {
  const { data } = buildTestApp()
  const template = Template.fromStack(data)

  it("creates two distinct Postgres credential secrets (app_owner master + app_user runtime)", () => {
    // The role split (ADR-0010, AFF-206): runtime traffic must connect as
    // `app_user` so FORCE RLS bites. The master `app_owner` secret stays for
    // migrations, the api container's pg-boss direct connection, and the
    // backup task's pg_dump. They MUST be separate Secrets Manager resources
    // so an `app_user` password rotation never touches master credentials.
    template.resourceCountIs("AWS::SecretsManager::Secret", 2)
  })

  it("databaseSecret embeds app_owner username + 32-char alphanumeric password", () => {
    template.hasResourceProperties("AWS::SecretsManager::Secret", {
      Description: Match.stringLikeRegexp("master credentials"),
      GenerateSecretString: Match.objectLike({
        SecretStringTemplate: Match.stringLikeRegexp("app_owner"),
        GenerateStringKey: "password",
        ExcludePunctuation: true,
        PasswordLength: 32,
      }),
    })
  })

  it("appUserSecret embeds app_user username + 32-char alphanumeric password", () => {
    template.hasResourceProperties("AWS::SecretsManager::Secret", {
      Description: Match.stringLikeRegexp("app_user role, RLS applies"),
      GenerateSecretString: Match.objectLike({
        SecretStringTemplate: Match.stringLikeRegexp("app_user"),
        GenerateStringKey: "password",
        ExcludePunctuation: true,
        PasswordLength: 32,
      }),
    })
  })

  it("appUserSecret is exposed on the stack instance for AppStack to consume", () => {
    // The dual-user pgbouncer composition in AppStack reads this secret to
    // populate DATABASE_URLS entry #2. The stack property must be defined.
    expect(data.appUserSecret).toBeDefined()
    expect(data.databaseSecret).toBeDefined()
    // The two are distinct resources, not aliases.
    expect(data.appUserSecret).not.toBe(data.databaseSecret)
  })
})
