from __future__ import annotations

import os
from pathlib import Path

from databricks import sql
from dotenv import load_dotenv


ROOT_DIR = Path(__file__).resolve().parent
load_dotenv(ROOT_DIR / ".env")


def _required_env(name: str) -> str:
    value = os.getenv(name, "").strip()
    if not value:
        raise ValueError(f"Missing required .env key: {name}")
    return value


def _count_rows(cursor: sql.client.Cursor, table_name: str) -> int:
    cursor.execute(f"SELECT COUNT(*) FROM {table_name}")
    result = cursor.fetchone()
    return int(result[0]) if result else 0


def _clear_table(cursor: sql.client.Cursor, table_name: str) -> str:
    try:
        cursor.execute(f"TRUNCATE TABLE {table_name}")
        return "TRUNCATE TABLE"
    except Exception:
        cursor.execute(f"DELETE FROM {table_name}")
        return "DELETE FROM"


def main() -> None:
    host = _required_env("DATABRICKS_HOST").replace("https://", "").replace("http://", "")
    token = _required_env("DATABRICKS_TOKEN")
    warehouse_id = _required_env("DATABRICKS_WAREHOUSE_ID")
    tables = [
        _required_env("OTEL_SPANS_TABLE"),
        _required_env("OTEL_LOGS_TABLE"),
        _required_env("OTEL_METRICS_TABLE"),
    ]

    with sql.connect(
        server_hostname=host,
        http_path=f"/sql/1.0/warehouses/{warehouse_id}",
        access_token=token,
    ) as conn:
        with conn.cursor() as cursor:
            print("Cleaning OTel UC target tables:")
            for table in tables:
                before = _count_rows(cursor, table)
                method = _clear_table(cursor, table)
                after = _count_rows(cursor, table)
                print(f"  - {table}: {before} -> {after} ({method})")


if __name__ == "__main__":
    main()
