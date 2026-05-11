SHELL := /bin/bash
CDK_DIR := cdk

REQUIRED_CDK_VARS := AWS_REGION AWS_ACCOUNT_ID

.PHONY: help synth-cdk diff-cdk deploy-cdk drift-cdk bootstrap-cdk check-cdk-env

help: ## list targets
	@grep -E '^[a-zA-Z_-]+:.*##' $(MAKEFILE_LIST) | awk -F':.*## ' '{printf "  %-18s %s\n", $$1, $$2}'

check-cdk-env:
	@for v in $(REQUIRED_CDK_VARS); do \
	  if [ -z "$${!v}" ]; then echo "ERROR: env var $$v is required (see infra/README.md)"; exit 1; fi; \
	done

synth-cdk: check-cdk-env ## cdk synth all stacks for ENV=staging|production (no AWS API)
	@if [ -z "$$ENV" ]; then echo "ERROR: ENV is required (staging|production)"; exit 1; fi
	cd $(CDK_DIR) && pnpm exec cdk synth --all --context env=$$ENV

diff-cdk: check-cdk-env ## cdk diff vs deployed state
	@if [ -z "$$ENV" ]; then echo "ERROR: ENV is required (staging|production)"; exit 1; fi
	cd $(CDK_DIR) && pnpm exec cdk diff --all --context env=$$ENV

deploy-cdk: check-cdk-env ## cdk deploy ENV=staging|production
	@if [ -z "$$ENV" ]; then echo "ERROR: ENV is required (staging|production)"; exit 1; fi
	cd $(CDK_DIR) && pnpm exec cdk deploy --all --context env=$$ENV --require-approval=never

drift-cdk: check-cdk-env ## cdk drift across all stacks
	@if [ -z "$$ENV" ]; then echo "ERROR: ENV is required (staging|production)"; exit 1; fi
	cd $(CDK_DIR) && pnpm exec cdk drift --all --context env=$$ENV

bootstrap-cdk: check-cdk-env ## cdk bootstrap the AWS account in REGION
	@if [ -z "$$REGION" ]; then echo "ERROR: REGION is required"; exit 1; fi
	cd $(CDK_DIR) && pnpm exec cdk bootstrap aws://$$AWS_ACCOUNT_ID/$$REGION
