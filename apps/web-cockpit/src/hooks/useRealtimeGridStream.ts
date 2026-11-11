'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import type { GridApi } from 'ag-grid-community';

export interface GridStreamEvent {
  type:
    | 'ORDER_AUTHORIZED'
    | 'DISPUTE_CREATED'
    | 'CUSTOMER.DISPUTE.UPDATED'
    | 'DISPUTE_RESOLVED'
    | 'BID_MATCHED'
    | 'CAPTURE_COMPLETED'
    | 'REFUND_ISSUED';
  payload: Record<string, any>;
  timestamp: string;
}

export interface UseRealtimeGridStreamOptions {
  gridApi: GridApi | null;
  sseEndpoint?: string;
}

export function useRealtimeGridStream({
  gridApi,
  sseEndpoint = '/api/events/stream',
}: UseRealtimeGridStreamOptions) {
  const [isConnected, setIsConnected] = useState(false);
  const [eventCount, setEventCount] = useState(0);
  const [lastEvent, setLastEvent] = useState<GridStreamEvent | null>(null);

  const applyStreamEvent = useCallback(
    (event: GridStreamEvent) => {
      if (!gridApi) return;

      const isUpdate = Boolean(event.payload.id || event.payload.transaction_id);

      if (event.type === 'DISPUTE_CREATED' || event.type === 'ORDER_AUTHORIZED') {
        gridApi.applyTransactionAsync({ add: [event.payload], addIndex: 0 });
      } else if (isUpdate) {
        gridApi.applyTransactionAsync({ update: [event.payload] });
      }

      setLastEvent(event);
      setEventCount((prev) => prev + 1);

      // Flash changed cells if getRowNode is available
      const rowId = event.payload.id || event.payload.transaction_id;
      if (rowId) {
        const rowNode = gridApi.getRowNode(String(rowId));
        if (rowNode) {
          gridApi.flashCells({
            rowNodes: [rowNode],
            flashDuration: 800,
            fadeDuration: 1200,
          });
        }
      }
    },
    [gridApi]
  );

  useEffect(() => {
    if (typeof window === 'undefined' || !gridApi) return;

    // Real-time EventSource connection for live stream events
    let es: EventSource | null = null;
    try {
      es = new EventSource(sseEndpoint);
      es.onopen = () => setIsConnected(true);
      es.onerror = () => setIsConnected(false);
      es.onmessage = (msg) => {
        try {
          const parsed = JSON.parse(msg.data);
          applyStreamEvent(parsed);
        } catch {
          // Ignore invalid parse
        }
      };
    } catch {
      // EventSource may not exist or endpoint inactive
    }

    return () => {
      if (es) es.close();
    };
  }, [gridApi, sseEndpoint, applyStreamEvent]);

  return {
    isConnected,
    eventCount,
    lastEvent,
  };
}

export default useRealtimeGridStream;
