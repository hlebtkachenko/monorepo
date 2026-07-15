-- 0062_profile_preferences.sql
--
-- Personal Profile fields. They remain global identity data, so the existing
-- app_user access model applies and no tenant policy is introduced here.

BEGIN;

ALTER TABLE app_user
  ADD COLUMN IF NOT EXISTS title_prefix text,
  ADD COLUMN IF NOT EXISTS given_name text,
  ADD COLUMN IF NOT EXISTS family_name text,
  ADD COLUMN IF NOT EXISTS title_suffix text,
  ADD COLUMN IF NOT EXISTS department text,
  ADD COLUMN IF NOT EXISTS theme varchar(10) NOT NULL DEFAULT 'system',
  ADD COLUMN IF NOT EXISTS icon_style varchar(20) NOT NULL DEFAULT 'lucide',
  ADD COLUMN IF NOT EXISTS date_format varchar(20) NOT NULL DEFAULT 'DD/MM/YYYY',
  ADD COLUMN IF NOT EXISTS time_format varchar(10) NOT NULL DEFAULT '24-hour',
  ADD COLUMN IF NOT EXISTS marketing_consent boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS product_updates_consent boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS signature_data text,
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

ALTER TABLE app_user
  DROP CONSTRAINT IF EXISTS app_user_date_format_valid,
  ADD CONSTRAINT app_user_date_format_valid
    CHECK (date_format IN ('DD/MM/YYYY', 'MM/DD/YYYY', 'YYYY-MM-DD')),
  DROP CONSTRAINT IF EXISTS app_user_time_format_valid,
  ADD CONSTRAINT app_user_time_format_valid
    CHECK (time_format IN ('24-hour', '12-hour')),
  DROP CONSTRAINT IF EXISTS app_user_theme_valid,
  ADD CONSTRAINT app_user_theme_valid
    CHECK (theme IN ('system', 'light', 'dark')),
  DROP CONSTRAINT IF EXISTS app_user_icon_style_valid,
  ADD CONSTRAINT app_user_icon_style_valid
    CHECK (icon_style IN ('lucide', 'phosphor', 'fontawesome'));

COMMIT;
