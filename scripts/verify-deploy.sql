-- Post-migration verification. Every line must report OK.
SELECT CASE WHEN count(*) >= 48 THEN 'OK   tables: '||count(*)
            ELSE 'FAIL tables: '||count(*)||' (expected 48+)' END
FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE';

SELECT CASE WHEN count(*) >= 100 THEN 'OK   rls policies: '||count(*)
            ELSE 'FAIL rls policies: '||count(*)||' (expected 100+)' END
FROM pg_policies WHERE schemaname='public';

SELECT CASE WHEN count(*) = 1 THEN 'OK   provisioning guard present'
            ELSE 'FAIL provisioning guard MISSING — public signup would create accounts' END
FROM pg_trigger WHERE tgname='on_auth_user_provisioning';

SELECT CASE WHEN count(*) = 1 THEN 'OK   privileged-column guard present'
            ELSE 'FAIL privileged-column guard MISSING — users could promote themselves' END
FROM pg_trigger WHERE tgname='profiles_guard_privileged';

SELECT CASE WHEN count(*) = 1 THEN 'OK   last-owner guard present'
            ELSE 'FAIL last-owner guard MISSING — the owner could be locked out' END
FROM pg_trigger WHERE tgname='profiles_guard_last_owner';

SELECT CASE WHEN count(*) = 1 THEN 'OK   site_commercials split present (site revenue hidden from field roles)'
            ELSE 'FAIL site_commercials MISSING' END
FROM information_schema.tables WHERE table_name='site_commercials';

SELECT CASE WHEN count(*) = 0 THEN 'OK   integrity: 0 violations'
            ELSE 'FAIL integrity violations: '||count(*) END
FROM v_integrity_check;

SELECT CASE WHEN count(*) <= 1 THEN 'OK   owners: '||count(*)
            ELSE 'CHECK more than one owner: '||count(*) END
FROM profiles WHERE role='owner' AND is_active AND deleted_at IS NULL;
