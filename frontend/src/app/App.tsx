import { useEffect } from 'react';
import { Toaster } from 'sonner';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import Notes from '../components/Notes';
import Tasks from '../components/Tasks';
import Metrics from '../components/Metrics';
import AuthPage from '../components/AuthPage';
import { useAuthStore } from '../store/auth';

export default function App() {
  const { isAuthenticated, user, fetchMe, logout } = useAuthStore();

  useEffect(() => {
    if (isAuthenticated) fetchMe();
  }, []);

  if (!isAuthenticated) return <AuthPage />;

  return (
    <div className="h-screen flex flex-col bg-background overflow-hidden">
      {/* Header */}
      <header className="border-b border-border px-6 py-3 flex items-center justify-between flex-shrink-0">
        <span className="font-semibold text-foreground">Knowledge Base</span>
        <div className="flex items-center gap-3">
          {user && (
            <span className="text-sm text-muted-foreground">{user.username}</span>
          )}
          <button
            onClick={logout}
            className="text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            Sign out
          </button>
        </div>
      </header>

      {/* Main */}
      <Tabs defaultValue="notes" className="flex-1 flex flex-col overflow-hidden">
        <TabsList className="flex-shrink-0 w-full justify-start rounded-none border-b border-border bg-transparent px-6 h-11">
          <TabsTrigger value="notes" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent">
            Notes
          </TabsTrigger>
          <TabsTrigger value="tasks" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent">
            Tasks
          </TabsTrigger>
          <TabsTrigger value="metrics" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent">
            Metrics
          </TabsTrigger>
        </TabsList>

        <TabsContent value="notes" className="flex-1 overflow-hidden m-0">
          <Notes />
        </TabsContent>
        <TabsContent value="tasks" className="flex-1 overflow-auto m-0 p-6">
          <Tasks />
        </TabsContent>
        <TabsContent value="metrics" className="flex-1 overflow-auto m-0 p-6">
          <Metrics />
        </TabsContent>
      </Tabs>

      <Toaster richColors position="bottom-right" />
    </div>
  );
}
