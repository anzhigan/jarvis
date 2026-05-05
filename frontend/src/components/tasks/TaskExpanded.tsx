import { useState } from 'react';
import { gosApi } from '../../api/client';
import type { Task } from '../../api/types';
import { useT } from '../../store/i18n';
import AddItemButton from '../AddItemButton';
import CreateGoForm from './CreateGoForm';
import CreateStepForm from './CreateStepForm';
import GoRow from './GoRow';
import StepBlock from './StepBlock';

export default function TaskExpanded({ task, onReload }: { task: Task; onReload: () => Promise<void> }) {
  const t = useT();
  const [addingStep, setAddingStep] = useState(false);
  const [addingGo, setAddingGo] = useState(false);
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

      {task.sprints.map((s) => (
        <StepBlock
          key={s.id}
          step={s}
          allStepsOfTask={task.sprints}
          onReload={onReload}
          showMeta={false}
        />
      ))}

      <AddItemButton label={t('tasks.addStep')} onClick={() => setAddingStep(true)} />
      <CreateStepForm
        open={addingStep}
        taskId={task.id}
        availableGos={directGos.filter((g) => !g.sprint_id)}
        onCancel={() => setAddingStep(false)}
        onCreate={async () => { setAddingStep(false); await onReload(); }}
      />

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

      <AddItemButton label={t('tasks.addGo')} onClick={() => setAddingGo(true)} />
      <CreateGoForm
        open={addingGo}
        defaultTaskId={task.id}
        availableSteps={task.sprints}
        onCancel={() => setAddingGo(false)}
        onCreate={async (data) => {
          await gosApi.create({ ...data, task_id: task.id });
          setAddingGo(false);
          await onReload();
        }}
      />
    </div>
  );
}
