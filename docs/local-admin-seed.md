# Local administrator reset

`npm run seed:dev` is a destructive local-only reset. It removes all application data and
Codeforces sync jobs, then creates exactly one System Admin account. The command refuses to run
when `NODE_ENV=production`.

Set the credentials before running it:

```text
DEV_ADMIN_EMAIL=admin@mrtee.vn
DEV_ADMIN_PASSWORD=<at-least-12-characters>
DEV_ADMIN_NAME=Quản trị viên
```

`DEV_ADMIN_PASSWORD` may fall back to `BOOTSTRAP_ADMIN_PASSWORD` for an existing local setup. No
default password is stored in source control.
