# Architecture Decision Records

## ADR-001: Use Egyptian Estimation as the project domain

Status: Accepted

The project is for the Egyptian Estimation card game, not Planning Poker or Agile estimation. The Egyptian Estimation Federation is the primary rule source. Secondary sources may be used only to clarify implementation behavior.

## ADR-002: CI/CD from project start

Status: Accepted

The repository will include CI/CD from the beginning using GitHub Actions. The first pipeline validates pushes and pull requests to main by installing dependencies, running type checks, lint script, tests, and build validation.

## ADR-003: Use configurable scoring profiles

Status: Accepted

The score engine will be configuration-driven to support official rules and common house-rule variations, especially Dash, Dash Call, and contracts 8 and above.
