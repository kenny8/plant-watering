console.log('Loading ScenariosPage.jsx...');

if (!window.React || !window.axios) {
  console.error('ScenariosPage.jsx: React or axios not loaded');
  throw new Error('React or axios not loaded');
}

const React = window.React;
const { useState, useEffect } = React;
const axios = window.axios;

function ScenariosPage() {
  console.log('ScenariosPage.jsx: Rendering');
  const [scenarios, setScenarios] = useState([]);
  const [builds, setBuilds] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchScenarios();
    fetchBuilds();
  }, []);

  const fetchScenarios = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get('/api/scenarios', {
        headers: { Authorization: `Bearer ${token}` }
      });
      setScenarios(response.data.scenarios || response.data || []);
      setLoading(false);
    } catch (error) {
      console.error('Error fetching scenarios:', error);
      setLoading(false);
    }
  };

  const fetchBuilds = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get('/api/builds', {
        headers: { Authorization: `Bearer ${token}` }
      });
      setBuilds(response.data.builds || response.data || []);
    } catch (error) {
      console.error('Error fetching builds:', error);
    }
  };

  const handleToggle = async (id, currentStatus) => {
    try {
      const token = localStorage.getItem('token');
      await axios.patch(`/api/scenarios/${id}/toggle`, {}, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setScenarios(scenarios.map(s => 
        s.id === id ? { ...s, is_active: !currentStatus } : s
      ));
    } catch (error) {
      console.error('Error toggling scenario:', error);
    }
  };

  const handleDelete = async (id) => {
    if (!confirm('Вы уверены, что хотите удалить этот сценарий?')) return;
    try {
      const token = localStorage.getItem('token');
      await axios.delete(`/api/scenarios/${id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setScenarios(scenarios.filter(s => s.id !== id));
    } catch (error) {
      console.error('Error deleting scenario:', error);
    }
  };

  const handleEdit = (id) => {
    window.history.pushState({}, '', `/scenarios/edit/${id}`);
    window.dispatchEvent(new Event('popstate'));
  };

  const handleCreate = () => {
    window.history.pushState({}, '', '/scenarios/create');
    window.dispatchEvent(new Event('popstate'));
  };

  const getBuildName = (buildId) => {
    const build = builds.find(b => b.id === buildId);
    return build ? build.human_name : `ID: ${buildId}`;
  };

  if (loading) {
    return React.createElement(
      'div',
      { className: 'flex items-center justify-center min-h-screen' },
      React.createElement('div', { className: 'text-xl' }, 'Загрузка...')
    );
  }

  return React.createElement(
    'div',
    { className: 'container mx-auto p-6' },
    React.createElement(
      'div',
      { className: 'flex justify-between items-center mb-6' },
      React.createElement('h1', { className: 'text-2xl font-bold text-gray-800' }, 'Сценарии'),
      React.createElement(
        'button',
        {
          onClick: handleCreate,
          className: 'bg-indigo-600 text-white py-2 px-4 rounded hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500'
        },
        'Создать сценарий'
      )
    ),
    React.createElement(
      'div',
      { className: 'bg-white shadow-md rounded-lg overflow-hidden' },
      React.createElement(
        'table',
        { className: 'min-w-full divide-y divide-gray-200' },
        React.createElement(
          'thead',
          { className: 'bg-gray-50' },
          React.createElement(
            'tr',
            null,
            React.createElement('th', { className: 'px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider' }, 'Название'),
            React.createElement('th', { className: 'px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider' }, 'ID сборки'),
            React.createElement('th', { className: 'px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider' }, 'Глобальный статус'),
            React.createElement('th', { className: 'px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider' }, 'Действия')
          )
        ),
        React.createElement(
          'tbody',
          { className: 'bg-white divide-y divide-gray-200' },
          scenarios.length === 0
            ? React.createElement(
                'tr',
                null,
                React.createElement(
                  'td',
                  { colSpan: 4, className: 'px-6 py-4 text-center text-gray-500' },
                  'Сценарии не найдены'
                )
              )
            : scenarios.map(scenario =>
                React.createElement(
                  'tr',
                  { key: scenario.id },
                  React.createElement('td', { className: 'px-6 py-4 whitespace-nowrap' }, scenario.human_name || scenario.machine_name),
                  React.createElement('td', { className: 'px-6 py-4 whitespace-nowrap' }, getBuildName(scenario.build_id)),
                  React.createElement(
                    'td',
                    { className: 'px-6 py-4 whitespace-nowrap' },
                    React.createElement(
                      'button',
                      {
                        onClick: () => handleToggle(scenario.id, scenario.is_active),
                        className: `relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${scenario.is_active ? 'bg-green-600' : 'bg-gray-300'}`
                      },
                      React.createElement(
                        'span',
                        {
                          className: `inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${scenario.is_active ? 'translate-x-6' : 'translate-x-1'}`
                        }
                      )
                    )
                  ),
                  React.createElement(
                    'td',
                    { className: 'px-6 py-4 whitespace-nowrap space-x-2' },
                    React.createElement(
                      'button',
                      {
                        onClick: () => handleEdit(scenario.id),
                        className: 'text-blue-600 hover:text-blue-800'
                      },
                      'Редактировать'
                    ),
                    React.createElement(
                      'button',
                      {
                        onClick: () => handleDelete(scenario.id),
                        className: 'text-red-600 hover:text-red-800'
                      },
                      '🗑️'
                    )
                  )
                )
              )
        )
      )
    )
  );
}

window.ScenariosPage = ScenariosPage;
console.log('ScenariosPage.jsx: ScenariosPage exported:', window.ScenariosPage);
