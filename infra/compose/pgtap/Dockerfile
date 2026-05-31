# pgTap-equipped Postgres 18 image for RLS policy testing.
#
# Used by .github/workflows/db-pgtap.yml and by ad-hoc local pgTap runs.
# pgTap is a unit-test framework for Postgres. Tests are .sql files that
# call functions like ok(), is(), throws_ok(), policies_are() to assert
# DB-side invariants that vitest cannot reach (policy existence, function
# ownership, trigger configuration, role grants, etc).
#
# Build:
#   docker build -t workspace-pgtap:dev -f infra/compose/pgtap/Dockerfile .
#
# Run tests against a running postgres:
#   docker run --rm --network=host \
#     -e PGHOST=127.0.0.1 -e PGUSER=app_owner -e PGPASSWORD=dev_owner \
#     -e PGDATABASE=app_dev \
#     -v $(pwd)/packages/db/tests/pgtap:/tests:ro \
#     workspace-pgtap:dev /tests/run-pgtap.sh

FROM postgres:18@sha256:8ff36f3c66371cba71d20ceedccfc3de9669a68737607888c4ef0af93abe8e39

RUN apt-get update && \
    apt-get install -y --no-install-recommends \
      postgresql-18-pgtap \
      postgresql-client-18 \
      perl \
      libtap-parser-sourcehandler-pgtap-perl \
    && rm -rf /var/lib/apt/lists/*

# pg_prove is the official pgTap harness. Ships with the perl TAP module above.
ENTRYPOINT []
CMD ["/bin/bash"]
