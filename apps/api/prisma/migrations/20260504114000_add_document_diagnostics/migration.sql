-- AlterTable
ALTER TABLE `content`
  ADD COLUMN `noErrorsConfirmed` BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN `accessibilityConfirmed` BOOLEAN NOT NULL DEFAULT false;
