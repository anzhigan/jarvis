import { useState } from 'react';
import { toast } from 'sonner';
import { gosApi, stepsApi } from '../../api/client';
import type { Step, Task } from '../../api/types';
import { useT } from '../../store/i18n';
import AddItemButton from '../AddItemButton';
import ConfirmDialog from '../ConfirmDialog';
import EditStepSheet from './EditStepSheet';
import AttachItemPicker from './AttachItemPicker';
import CreateGoForm from './CreateGoForm';
import CreateStepForm from './CreateStepForm';
import GoRow from './GoRow';
import StepCard from './StepCard';

export default function TaskExpanded({ task, onReload }: { task: Task; onReload: () => Promise<void> }) {
  const t = useT();
  const [pick, setPick] = useState<'step' | 'go' | null>(null);
  const [creatingStep, setCreatingStep] = useState(false);
  const [creatingGo, setCreatingGo] = useState(false);
  const [editingStep, setEditingStep] = useState<Step | null>(null);
  const [deletingStep, setDeletingStep] = useState<Step | null>(null);
  const directGos = task.gos;

  return (
    <div className="task-expanded">
      {task.sprints.length > 0 && (
        <div>
          <div style={{ height: 4, borderRadius: 'var(--r-pill)', overflow: 'hidden', background: 'var(--bg-app)', marginBottom: 10 }}>
            <div style={{ height: '100%', width: `${task.progress}%`, background: 'var(--accent-goals)', borderRadius: 'inherit', transition: 'width 300ms' }} />
          </div>
        </div>
      )}

      {task.sprints.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {task.sprints.map((s) => (
            <StepCard
              key={s.id}
              step={s}
              showGoalTag={false}
              onEdit={() => setEditingStep(s)}
              onDelete={() => setDeletingStep(s)}
            />
          ))}
        </div>
      )}

      {editingStep && (
        <EditStepSheet
          step={editingStep}
          onClose={() => setEditingStep(null)}
          onSaved={async () => { setEditingStep(null); await onReload(); }}
        />
      )}

      {deletingStep && (
        <ConfirmDialog
          open
          title="Delete step?"
          message={`"${deletingStep.title}" will be removed; attached gos stay.`}
          onCancel={() => setDeletingStep(null)}
          onConfirm={async () => {
            const s = deletingStep;
            setDeletingStep(null);
            try { await stepsApi.delete(s.id); await onReload(); }
            catch (e: any) { toast.error(e?.detail ?? 'Failed'); }
          }}
        />
      )}

      {directGos.length > 0 && (
        <div>
          <div className="task-expanded-section-label">{t('tasks.directGos')}</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {directGos.map((g) => (
              <GoRow key={g.id} go={g} availableSteps={task.sprints} onReload={onReload} />
            ))}
          </div>
        </div>
      )}

      <div className="add-row">
        <AddItemButton label={t('tasks.addStep')} onClick={() => setPick('step')} />
        <AddItemButton label={t('tasks.addGo')} onClick={() => setPick('go')} />
      </div>

      {pick === 'step' && (
        <AttachItemPicker
          kind="step"
          excludeTaskId={task.id}
          onClose={() => setPick(null)}
          onAttach={async (id) => {
            try { await stepsApi.update(id, { task_id: task.id }); await onReload(); setPick(null); }
            catch { setPick(null); }
          }}
          onCreateNew={() => { setPick(null); setCreatingStep(true); }}
        />
      )}
      {pick === 'go' && (
        <AttachItemPicker
          kind="go"
          excludeTaskId={task.id}
          onClose={() => setPick(null)}
          onAttach={async (id) => {
            try { await gosApi.update(id, { task_id: task.id }); await onReload(); setPick(null); }
            catch { setPick(null); }
          }}
          onCreateNew={() => { setPick(null); setCreatingGo(true); }}
        />
      )}

      <CreateStepForm
        open={creatingStep}
        taskId={task.id}
        availableGos={directGos.filter((g) => !g.sprint_id)}
        onCancel={() => setCreatingStep(false)}
        onCreate={async () => { setCreatingStep(false); await onReload(); }}
      />

      <CreateGoForm
        open={creatingGo}
        defaultTaskId={task.id}
        availableSteps={task.sprints}
        onCancel={() => setCreatingGo(false)}
        onCreate={async (data) => {
          await gosApi.create({ ...data, task_id: task.id });
          setCreatingGo(false);
          await onReload();
        }}
      />
    </div>
  );
}
