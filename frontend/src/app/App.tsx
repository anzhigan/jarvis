import { useState } from 'react';
import { motion } from 'motion/react';
import { BookOpen, CheckSquare, BarChart3 } from 'lucide-react';
import Notes from '../components/Notes';
import Tasks from '../components/Tasks';
import Metrics from '../components/Metrics';

type View = 'notes' | 'tasks' | 'metrics';

export default function App() {
  const [activeView, setActiveView] = useState<View>('notes');

  return (
    <div className="size-full flex flex-col bg-background">
      {/* Header */}
      <header className="border-b border-border px-6 py-4">
        <h1 className="text-foreground">Knowledge & Tasks</h1>
      </header>

      {/* Navigation */}
      <nav className="border-b border-border px-6">
        <div className="flex gap-6">
          {[
            { id: 'notes' as const, label: 'Notes', icon: BookOpen },
            { id: 'tasks' as const, label: 'Tasks', icon: CheckSquare },
            { id: 'metrics' as const, label: 'Metrics', icon: BarChart3 },
          ].map((item) => (
            <button
              key={item.id}
              onClick={() => setActiveView(item.id)}
              className="relative flex items-center gap-2 px-1 py-3 text-muted-foreground hover:text-foreground transition-colors"
            >
              <item.icon size={18} />
              <span>{item.label}</span>
              {activeView === item.id && (
                <motion.div
                  layoutId="activeTab"
                  className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary"
                  transition={{ type: 'spring', duration: 0.5, bounce: 0.2 }}
                />
              )}
            </button>
          ))}
        </div>
      </nav>

      {/* Main Content */}
      <main className="flex-1 overflow-hidden">
        <motion.div
          key={activeView}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="size-full"
        >
          {activeView === 'notes' && <Notes />}
          {activeView === 'tasks' && <Tasks />}
          {activeView === 'metrics' && <Metrics />}
        </motion.div>
      </main>
    </div>
  );
}
