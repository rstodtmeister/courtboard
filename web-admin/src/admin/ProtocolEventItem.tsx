import React from 'react';
import { historyDescription, protocolEventSummary, protocolFieldLabels, protocolSourceLabels, protocolValue, type ProtocolEvent } from '../gameProtocols';

export function ProtocolEventItem({ event }: { event: ProtocolEvent }) {
  const date = new Date(event.recorded_at);
  const source = event.source === 'referee' ? 'Schiri' : event.source === 'admin' ? 'Admin' : event.source === 'baseline' ? 'Bestand' : 'System';
  return <li className="protocol-event">
    <details>
      <summary className="protocol-event-summary">
        <time dateTime={event.recorded_at} title={date.toLocaleString('de-DE')}>
          {date.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' })} {date.toLocaleTimeString('de-DE')}
        </time>
        <strong>{protocolEventSummary(event)}</strong>
        <span className="protocol-event-source" title={protocolSourceLabels[event.source]}>{source}</span>
      </summary>
      <div className="protocol-event-details">
        <p>{protocolSourceLabels[event.source]}{event.source === 'admin' && ` · ${event.actor_label ?? event.actor_id ?? 'Unbekannt'}`}</p>
        {event.snapshot && <dl>{Object.entries(event.snapshot).map(([field, value]) => <React.Fragment key={field}>
          <dt>{protocolFieldLabels[field] ?? field}</dt><dd>{protocolValue(value)}</dd>
        </React.Fragment>)}</dl>}
        {Object.keys(event.changes).length > 0 && <ul>{Object.entries(event.changes).map(([field, change]) => <li key={field}>
          {protocolFieldLabels[field] ?? field}: {protocolValue(change.before)} → <strong>{protocolValue(change.after)}</strong>
        </li>)}</ul>}
        {event.history_change && <details><summary>Punkteverlauf / Auszeiten im Detail</summary>
          <ul>{historyDescription(event).map((text, i) => <li key={i}>{text}</li>)}</ul>
        </details>}
      </div>
    </details>
  </li>;
}
