import { Drawer } from '@/components/ui/Overlay';
import { useRecord } from '@/context/AppStore';
import { DecisionDetail } from './DecisionDetail';
import { formatDateTime } from '@/lib/format';
import { describeAction } from '@/lib/records';

export function DecisionDrawer({ id, onClose }: { id: string | null; onClose: () => void }) {
  const record = useRecord(id);
  return (
    <Drawer
      open={Boolean(id && record)}
      onClose={onClose}
      title={record ? describeAction(record.request) : 'Decision'}
      subtitle={
        record && (
          <span className="font-mono">
            {record.id} · {record.agent_name} · {formatDateTime(record.response.created_at)}
          </span>
        )
      }
    >
      {record && <DecisionDetail record={record} />}
    </Drawer>
  );
}
