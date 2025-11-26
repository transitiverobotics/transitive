# ClickHouse use in Transitive

Every time an organization user is logged into the portal a new user is created (if it doesn't previously exist) on clickhouse. This user is limited by row policies to only read rows having its own username in the OrgId column, across all databases (default + per capability databases) and all tables.

Recapping clickhouse users management at this point:

- DB engine Admin user:
  - Name: `CLICKHOUSE_USER` env var (defaults to `default`)
  - Password: `CLICKHOUSE_PASSWORD` (defaults to empty)
  - Access: Full admin power on all databases
- Per capability users:
  - Name: `cap_CAPABILITY_NAME_user`
  - Password: auto-generated, stored in mongodb within `capabilities` collection
  - Access: Full access to the capability DB (`cap_CAPABILITY_NAME`)
- Per organization users:
  - Name: `org_USERNAME_user`
  - Password: auto-generated, stored within accounts collection (`clickhouse_credentials` field)
  - Access: Read only access to own data across all databases.

From (https://github.com/transitiverobotics/transitive/pull/136).
