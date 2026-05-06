"""
Bulk-update existing users with their physical campus card data.

Useful for the demo: registrar hands you a CSV exported from their student
records and you populate `enrollment_number` (and related fields) for every
user in one shot.

Usage:
    python -m django backfill_card_data path/to/cards.csv \\
        --settings=fyp_backend.settings

CSV format (header row required, columns are order-independent):
    email, enrollment_number, campus, card_serial_no,
    card_issued_on, card_valid_upto, program

Only `email` is required. Any other column may be omitted; existing values
won't be overwritten with blanks. Match is by email (case-insensitive).

Example CSV:
    email,enrollment_number,campus,card_serial_no,card_issued_on,card_valid_upto,program
    sohaib@bahria.edu.pk,03-134221-001,Lahore Campus,36190,SEP-2022,SEP-2028,BS (CS)
    ahmed@bahria.edu.pk,03-134221-002,Lahore Campus,36191,SEP-2022,SEP-2028,BS (SE)

Output:
    Reports per-row status (UPDATED / SKIPPED / NOT_FOUND / ERROR) plus a
    summary at the end. Use `--dry-run` to preview without writing.
"""
from __future__ import annotations

import csv
from pathlib import Path

from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from auth_module.models import User


# Columns we recognise. `email` is the lookup key; everything else maps to
# a User field of the same name.
EDITABLE_COLUMNS = {
    "enrollment_number",
    "campus",
    "card_serial_no",
    "card_issued_on",
    "card_valid_upto",
    "program",
    "department",
    "designation",
}


class Command(BaseCommand):
    help = "Bulk-populate User.enrollment_number and related card fields from a CSV."

    def add_arguments(self, parser):
        parser.add_argument("csv_path", type=str, help="Path to CSV file")
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Parse and validate the CSV without writing to the database.",
        )
        parser.add_argument(
            "--overwrite",
            action="store_true",
            help="Overwrite existing values. By default, blanks in the CSV "
                 "preserve whatever's in the DB.",
        )

    def handle(self, *args, **opts):
        csv_path = Path(opts["csv_path"])
        if not csv_path.exists():
            raise CommandError(f"File not found: {csv_path}")

        dry_run  = opts["dry_run"]
        overwrite = opts["overwrite"]

        updated, skipped, not_found, errors = 0, 0, 0, 0

        with open(csv_path, newline="", encoding="utf-8-sig") as fh:
            reader = csv.DictReader(fh)
            if "email" not in (reader.fieldnames or []):
                raise CommandError("CSV must have an 'email' column.")

            unknown = set(reader.fieldnames or []) - EDITABLE_COLUMNS - {"email"}
            if unknown:
                self.stdout.write(self.style.WARNING(
                    f"Ignoring unknown columns: {sorted(unknown)}"
                ))

            self.stdout.write(self.style.MIGRATE_HEADING(
                f"\n{'DRY RUN — ' if dry_run else ''}"
                f"Processing {csv_path.name}\n"
            ))

            with transaction.atomic():
                for row_num, row in enumerate(reader, start=2):
                    email = (row.get("email") or "").strip().lower()
                    if not email:
                        self.stdout.write(self.style.WARNING(
                            f"  row {row_num}: SKIPPED (no email)"
                        ))
                        skipped += 1
                        continue

                    try:
                        user = User.objects.get(email__iexact=email)
                    except User.DoesNotExist:
                        self.stdout.write(self.style.WARNING(
                            f"  row {row_num}: NOT_FOUND  ({email})"
                        ))
                        not_found += 1
                        continue
                    except Exception as e:
                        self.stdout.write(self.style.ERROR(
                            f"  row {row_num}: ERROR      ({email}) — {e}"
                        ))
                        errors += 1
                        continue

                    # Build the update dict, respecting --overwrite policy
                    changes = {}
                    for col in EDITABLE_COLUMNS:
                        if col not in row:
                            continue
                        raw = (row.get(col) or "").strip()
                        if not raw and not overwrite:
                            continue  # don't blank out existing data
                        existing = getattr(user, col, None) or ""
                        if str(existing) == raw:
                            continue  # no change
                        changes[col] = raw or None  # convert "" to None for nullable fields

                    if not changes:
                        self.stdout.write(
                            f"  row {row_num}: SKIPPED   ({email}) — already up to date"
                        )
                        skipped += 1
                        continue

                    for k, v in changes.items():
                        setattr(user, k, v)

                    try:
                        user.full_clean(exclude=["password"])
                        if not dry_run:
                            user.save(update_fields=list(changes.keys()))
                        diff = ", ".join(f"{k}={v!r}" for k, v in changes.items())
                        self.stdout.write(self.style.SUCCESS(
                            f"  row {row_num}: UPDATED   ({email})  {diff}"
                        ))
                        updated += 1
                    except Exception as e:
                        self.stdout.write(self.style.ERROR(
                            f"  row {row_num}: ERROR     ({email}) — {e}"
                        ))
                        errors += 1

                if dry_run:
                    transaction.set_rollback(True)

        # ── Summary ────────────────────────────────────────────────
        self.stdout.write(self.style.MIGRATE_HEADING("\nSummary"))
        self.stdout.write(f"  Updated:    {updated}")
        self.stdout.write(f"  Skipped:    {skipped}")
        self.stdout.write(f"  Not found:  {not_found}")
        self.stdout.write(f"  Errors:     {errors}")
        if dry_run:
            self.stdout.write(self.style.WARNING(
                "\n(Dry run; no changes were written to the database.)"
            ))
