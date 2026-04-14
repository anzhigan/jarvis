import { useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts';
import { CheckCircle2, Circle, Clock, TrendingUp } from 'lucide-react';

export default function Metrics() {
  const [tasks] = useState([
    { id: '1', title: 'Complete project documentation', completed: false, week: 'Week 1' },
    { id: '2', title: 'Review design mockups', completed: true, week: 'Week 1' },
    { id: '3', title: 'Prepare presentation slides', completed: false, week: 'Week 2' },
    { id: '4', title: 'Code review session', completed: true, week: 'Week 1' },
    { id: '5', title: 'Update API documentation', completed: true, week: 'Week 2' },
    { id: '6', title: 'Team standup preparation', completed: false, week: 'Week 2' },
    { id: '7', title: 'Write unit tests', completed: true, week: 'Week 2' },
    { id: '8', title: 'Deploy to staging', completed: true, week: 'Week 3' },
  ]);

  const totalTasks = tasks.length;
  const completedTasks = tasks.filter((t) => t.completed).length;
  const activeTasks = totalTasks - completedTasks;
  const completionRate = Math.round((completedTasks / totalTasks) * 100);

  const weeklyData = ['Week 1', 'Week 2', 'Week 3'].map((week) => {
    const weekTasks = tasks.filter((t) => t.week === week);
    return {
      week,
      completed: weekTasks.filter((t) => t.completed).length,
      active: weekTasks.filter((t) => !t.completed).length,
    };
  });

  const pieData = [
    { name: 'Completed', value: completedTasks, color: '#030213' },
    { name: 'Active', value: activeTasks, color: '#ececf0' },
  ];

  const stats = [
    {
      label: 'Total Tasks',
      value: totalTasks,
      icon: Circle,
      color: 'text-foreground',
    },
    {
      label: 'Completed',
      value: completedTasks,
      icon: CheckCircle2,
      color: 'text-foreground',
    },
    {
      label: 'Active',
      value: activeTasks,
      icon: Clock,
      color: 'text-muted-foreground',
    },
    {
      label: 'Completion Rate',
      value: `${completionRate}%`,
      icon: TrendingUp,
      color: 'text-foreground',
    },
  ];

  return (
    <div className="size-full overflow-y-auto">
      <div className="max-w-6xl mx-auto px-6 py-8">
        <h2 className="mb-8">Task Completion Metrics</h2>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-12">
          {stats.map((stat) => (
            <div key={stat.label} className="p-6 bg-card border border-border rounded-lg">
              <div className="flex items-center gap-3 mb-3">
                <stat.icon size={20} className={stat.color} />
                <span className="text-muted-foreground">{stat.label}</span>
              </div>
              <div className={`${stat.color}`}>{stat.value}</div>
            </div>
          ))}
        </div>

        {/* Charts */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Weekly Progress */}
          <div className="p-6 bg-card border border-border rounded-lg">
            <h3 className="mb-6">Weekly Progress</h3>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={weeklyData}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.1)" />
                <XAxis dataKey="week" stroke="#717182" />
                <YAxis stroke="#717182" />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#ffffff',
                    border: '1px solid rgba(0,0,0,0.1)',
                    borderRadius: '0.5rem',
                  }}
                />
                <Legend />
                <Bar dataKey="completed" fill="#030213" name="Completed" radius={[4, 4, 0, 0]} />
                <Bar dataKey="active" fill="#ececf0" name="Active" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Completion Distribution */}
          <div className="p-6 bg-card border border-border rounded-lg">
            <h3 className="mb-6">Completion Distribution</h3>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={pieData}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                  outerRadius={100}
                  fill="#8884d8"
                  dataKey="value"
                >
                  {pieData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#ffffff',
                    border: '1px solid rgba(0,0,0,0.1)',
                    borderRadius: '0.5rem',
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Recent Activity */}
        <div className="mt-8 p-6 bg-card border border-border rounded-lg">
          <h3 className="mb-4">Task Insights</h3>
          <div className="space-y-3">
            <div className="flex items-start gap-3">
              <div className="w-1 h-1 mt-2 rounded-full bg-primary"></div>
              <p className="text-muted-foreground flex-1">
                You've completed <span className="text-foreground">{completedTasks} out of {totalTasks}</span> tasks
              </p>
            </div>
            <div className="flex items-start gap-3">
              <div className="w-1 h-1 mt-2 rounded-full bg-primary"></div>
              <p className="text-muted-foreground flex-1">
                Your completion rate is <span className="text-foreground">{completionRate}%</span>
              </p>
            </div>
            <div className="flex items-start gap-3">
              <div className="w-1 h-1 mt-2 rounded-full bg-primary"></div>
              <p className="text-muted-foreground flex-1">
                <span className="text-foreground">{activeTasks}</span> tasks are currently active
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
