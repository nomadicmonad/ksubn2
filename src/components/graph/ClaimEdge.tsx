'use client';

import { getSmoothStepPath, EdgeLabelRenderer, type EdgeProps } from 'reactflow';
import { RELATION_META } from '@/types';
import type { RelationType } from '@/types';

export interface ClaimEdgeData {
  relation_type: RelationType;
  claim_id?: string;
  description?: string;
  source_url?: string;
  source_domain?: string;
  onSelect?: (data: ClaimEdgeData) => void;
}

export function ClaimEdge({
  id, sourceX, sourceY, targetX, targetY,
  sourcePosition, targetPosition,
  data, style, markerEnd,
}: EdgeProps<ClaimEdgeData>) {
  const [edgePath, labelX, labelY] = getSmoothStepPath({
    sourceX, sourceY, sourcePosition,
    targetX, targetY, targetPosition,
  });

  const meta = data?.relation_type ? RELATION_META[data.relation_type] : RELATION_META.other;

  return (
    <>
      <path
        id={id}
        d={edgePath}
        fill="none"
        style={style}
        markerEnd={markerEnd}
        className="react-flow__edge-path"
      />
      <EdgeLabelRenderer>
        <div
          style={{
            position: 'absolute',
            transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
            pointerEvents: 'all',
            zIndex: 10,
          }}
          className="nodrag nopan"
        >
          <button
            onClick={() => data?.onSelect?.(data)}
            title={meta.label}
            style={{
              background: '#0f0f1a',
              border: `1px solid ${meta.color}66`,
              borderRadius: '999px',
              padding: '2px 8px',
              fontSize: '13px',
              cursor: data?.description || data?.source_url ? 'pointer' : 'default',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              color: meta.color,
              fontWeight: 500,
              whiteSpace: 'nowrap',
              lineHeight: 1.4,
            }}
          >
            <span style={{ fontFamily: 'system-ui, -apple-system, sans-serif' }}>{meta.icon}</span>
            <span style={{ fontSize: '10px', fontFamily: 'system-ui, -apple-system, sans-serif' }}>{meta.label}</span>
          </button>
        </div>
      </EdgeLabelRenderer>
    </>
  );
}
