SHELL := /bin/bash
TOFU_DIR := tofu
CDK_DIR  := cdk

REQUIRED_TOFU_VARS := AWS_REGION AWS_PROFILE TOFU_STATE_BUCKET TOFU_LOCK_TABLE
REQUIRED_CDK_VARS  := AWS_REGION AWS_PROFILE CDK_DEFAULT_ACCOUNT

.PHONY: help plan-tofu apply-tofu fmt-tofu synth-cdk diff-cdk deploy-cdk drift-cdk bootstrap-cdk check-tofu-env check-cdk-env

help: ## list targets
	@grep -E '^[a-zA-Z_-]+:.*##' $(MAKEFILE_LIST) | awk -F':.*## ' '{printf "  %-18s %s\n", $$1, $$2}'

check-tofu-env:
	@for v in $(REQUIRED_TOFU_VARS); do \
	  if [ -z "$${!v}" ]; then echo "ERROR: env var $$v is required (TBD: set per docs/runbooks/AWS-BOOTSTRAP.md)"; exit 1; fi; \
	done

check-cdk-env:
	@for v in $(REQUIRED_CDK_VARS); do \
	  if [ -z "$${!v}" ]; then echo "ERROR: env var $$v is required (TBD: set per docs/runbooks/AWS-BOOTSTRAP.md)"; exit 1; fi; \
	done

plan-tofu: check-tofu-env ## tofu init + plan
	cd $(TOFU_DIR) && tofu init -upgrade && tofu plan -out=tfplan

apply-tofu: check-tofu-env ## tofu apply previously generated plan
	cd $(TOFU_DIR) && tofu apply tfplan

fmt-tofu: ## tofu fmt -recursive (no env required)
	cd $(TOFU_DIR) && tofu fmt -recursive

synth-cdk: ## cdk synth all stacks (no AWS API)
	cd $(CDK_DIR) && pnpm exec cdk synth --all

diff-cdk: check-cdk-env ## cdk diff vs deployed state
	cd $(CDK_DIR) && pnpm exec cdk diff --all

deploy-cdk: check-cdk-env ## cdk deploy ENV=staging|production
	@if [ -z "$$ENV" ]; then echo "ERROR: ENV is required (staging|production)"; exit 1; fi
	cd $(CDK_DIR) && pnpm exec cdk deploy --all --context env=$$ENV --require-approval=never

drift-cdk: check-cdk-env ## cdk drift across all stacks
	cd $(CDK_DIR) && pnpm exec cdk drift --all

bootstrap-cdk: check-cdk-env ## cdk bootstrap a workload account
	@if [ -z "$$ACCOUNT" ] || [ -z "$$REGION" ]; then echo "ERROR: ACCOUNT and REGION are required"; exit 1; fi
	cd $(CDK_DIR) && pnpm exec cdk bootstrap aws://$$ACCOUNT/$$REGION
