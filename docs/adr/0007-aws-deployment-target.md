# ADR-0007: AWS deployment target

- **Status:** Proposed
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
