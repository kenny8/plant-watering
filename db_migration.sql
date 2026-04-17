-- Migration script for adding bot_proxy_url column to settings table
-- Run this on existing MariaDB databases

USE plant_watering;

-- Add bot_proxy_url column if it doesn't exist
ALTER TABLE `settings` 
ADD COLUMN `bot_proxy_url` varchar(512) DEFAULT NULL 
AFTER `telegram_bot_token`;

-- Verify the change
SELECT COLUMN_NAME, DATA_TYPE, CHARACTER_MAXIMUM_LENGTH, IS_NULLABLE, COLUMN_DEFAULT
FROM INFORMATION_SCHEMA.COLUMNS 
WHERE TABLE_SCHEMA = 'plant_watering' 
  AND TABLE_NAME = 'settings';
