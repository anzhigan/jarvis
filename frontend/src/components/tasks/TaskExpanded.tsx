import { useState } from 'react';
import { gosApi } from '../../api/client';
import type { Task } from '../../api/types';
import { useT } from '../../store/i18n';
import AddItemButton from '../AddItemButton';
import CreateGoForm from './CreateGoForm';
import CreateSprintForm from './CreateSprintForm';
import GoRow from './GoRow';
import SprintBlock from './SprintBlock';

export default function TaskExpanded({ task, onReload }: { task: Task; onReload: () => Promise<void> }) {
  const t = useT();
  const [addingSprint, setAddingSprint] = useState(false);
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
        <SprintBlock
          key={s.id}
          sprint={s}
          allSprintsOfTask={task.sprints}
          onReload={onReload}
          showMeta={false}
        />
      ))}

      <AddItemButton label={t('tasks.addSprint')} onClick={() => setAddingSprint(true)} />
      <CreateSprintForm
        open={addingSprint}
        taskId={task.id}
        availableGos={directGos.filter((g) => !g.sprint_id)}
        onCancel={() => setAddingSprint(false)}
        onCreate={async () => { setAddingSprint(false); await onReload(); }}
      />

      {directGos.length > 0 && (
        <div>
          <div className="task-expanded-section-label">Direct gos</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {directGos.map((g) => (
              <GoRow key={g.id} go={g} availableSprints={task.sprints} onReload={onReload} />
            ))}
          </div>
        </div>
      )}

      <AddItemButton label={t('tasks.addGo')} onClick={() => setAddingGo(true)} />
      <CreateGoForm
        open={addingGo}
        defaultTaskId={task.id}
        availableSprints={task.sprints}
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
