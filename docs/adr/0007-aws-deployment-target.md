# ADR-0007: AWS deployment target

- **Status:** Proposed. Amended 2026-10-28 by [ADR-0011](0011-space-photo-storage.md) (object storage for space
  photos, 003 T001).
- **Date:** 2026-10-22
- **Deciders:** project lead, devops agent

## Context

Production will run on AWS. No cloud resources exist yet, and none will be created
without explicit human approval.

## Decision (proposed)

- **Compute:** ECS Fargate services for `api` and `web`, built from the multi-stage
  Dockerfiles in `docker/` (non-root, Next.js `standalone` output). Images go to ECR and are
  scanned by Trivy in CI.
- **Routing:** one ALB with path rules: `/api/*` and `/health/*` go to api, everything else
  goes to web (same-origin cookies, see ADR-0004). TLS terminates at the ALB (ACM).
- **Data:** RDS PostgreSQL 18 (Multi-AZ in prod) and ElastiCache for Redis/Valkey 8.
- **Object storage (amendment 2026-10-28, ADR-0011):** one private S3 bucket per environment
  (`bseat-photos-<env>`) for space photos. Block Public Access on, bucket-owner-enforced ownership, SSE-S3, a
  TLS-only bucket policy, versioning off, and incomplete multipart uploads aborted after 1 day. The api task role
  may only `s3:PutObject`, `s3:GetObject` and `s3:DeleteObject` on `spaces/*`. Browsers read through presigned
  GET URLs valid for at most 1 hour, and there is no CloudFront yet (a follow-up ADR). The api task's memory is
  sized for in-request image processing (ADR-0011 section 4). Locally, an S3-compatible compose service named
  `storage`. Like every resource here, the bucket is created only with human approval.
- **Mail:** Amazon SES via SMTP (`SMTP_HOST`/`SMTP_PORT`).
- **Secrets:** Secrets Manager / SSM, injected as ECS task env. Never baked into images.
- **Migrations:** a one-off ECS task runs `drizzle-kit migrate` before the api service deploys.
- **Observability:** OTLP to the ADOT collector (X-Ray/CloudWatch), JSON logs to CloudWatch.
  The ALB health check uses `/health/ready`; the container health check uses `/health/live`.
- **IaC:** to be decided (Terraform or CDK) in a follow-up ADR.
- **CI/CD:** GitHub Actions with OIDC → AWS (no long-lived keys); deploy jobs are added
  once the infrastructure exists.

## Consequences

The app is ready to containerize and deploy. Accepting this ADR, the IaC choice and
budget sign-off are open human decisions.
