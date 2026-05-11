variable "aws_region" {
  type        = string
  default     = "eu-central-1"
  description = "Primary region. DR region is eu-west-1."
}

variable "org_id" {
  type        = string
  description = "AWS Organizations org id (post-bootstrap; see AWS-BOOTSTRAP runbook step 2)."
}

variable "environment" {
  type        = string
  description = "Logical environment label for tagging (e.g. platform)."
}
