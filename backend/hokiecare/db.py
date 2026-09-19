"""Bounded Statement Execution, used by both the app and the import tooling."""
import os
import time
from databricks.sdk import WorkspaceClient
from databricks.sdk.core import Config
from databricks.sdk.service.sql import StatementState, StatementParameterListItem


def client():
    return WorkspaceClient(config=Config(profile=os.environ.get("DATABRICKS_CONFIG_PROFILE"),
                           http_timeout_seconds=15, retry_timeout_seconds=20))


def execute(w, sql, parameters=None, *, timeout=45, warehouse=None):
    warehouse = warehouse or os.environ["DATABRICKS_WAREHOUSE_ID"]
    started = time.monotonic()
    response = w.statement_execution.execute_statement(
        warehouse_id=warehouse, statement=sql, wait_timeout="10s", row_limit=1000,
        parameters=[StatementParameterListItem(name=k, value=str(v)) for k, v in (parameters or {}).items()],
    )
    while response.status.state in (StatementState.PENDING, StatementState.RUNNING):
        if time.monotonic() - started > timeout:
            w.statement_execution.cancel_execution(response.statement_id)
            raise TimeoutError("Databricks query timed out")
        time.sleep(1)
        response = w.statement_execution.get_statement(response.statement_id)
    if response.status.state != StatementState.SUCCEEDED:
        # SQL details are useful to import operators, but never returned by public routes.
        raise RuntimeError(f"Databricks statement failed: {response.status.error}")
    if response.manifest and response.manifest.truncated:
        raise RuntimeError("Unexpected truncated result")
    rows = []
    if response.result and response.result.data_array:
        columns = [c.name for c in response.manifest.schema.columns]
        rows.extend(dict(zip(columns, r)) for r in response.result.data_array)
        chunk = response.result
        while chunk.next_chunk_index is not None:
            chunk = w.statement_execution.get_statement_result_chunk_n(response.statement_id, chunk.next_chunk_index)
            rows.extend(dict(zip(columns, r)) for r in chunk.data_array or [])
    return rows, response.statement_id
