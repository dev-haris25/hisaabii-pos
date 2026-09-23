/**
 * @param {import('better-sqlite3').Database} db
 * @param {{ eventId: string, eventType: string, payload: unknown }} input
 */
function enqueueOutbox(db, input) {
  db.prepare(
    `INSERT OR IGNORE INTO outbox (event_id, event_type, payload_json)
     VALUES (@event_id, @event_type, @payload_json)`,
  ).run({
    event_id: input.eventId,
    event_type: input.eventType,
    payload_json: JSON.stringify(input.payload ?? null),
  })
}

module.exports = { enqueueOutbox }
