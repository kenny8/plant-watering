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

  const getBuildName = (buildId) => {
    const build = builds.find(b => b.id === buildId);
    return build ? build.human_name : `ID: ${buildId}`;
  };

  if (loading) {
    return React.createElement(
      'div',
      { className: 'container mx-auto p-6' },
      React.createElement('div', { className: 'text-xl' }, 'Загрузка...')
    );
  }

  return React.createElement(
    'div',
    { className: 'flex flex-col items-center min-h-screen bg-gray-100 py-8' },
    React.createElement(
      'div',
      { className: 'w-full max-w-4xl' },
      React.createElement('h1', { className: 'text-2xl font-bold text-center text-blue-600 mb-6' }, 'Сценарии'),
      scenarios.length === 0
        ? React.createElement('p', { className: 'text-gray-600 text-center' }, 'Сценарии отсутствуют')
        : React.createElement(
            'table',
            { className: 'w-full bg-white shadow-md rounded-lg overflow-hidden' },
            React.createElement(
              'thead',
              { className: 'bg-blue-600 text-white' },
              React.createElement(
                'tr',
                null,
                React.createElement('th', { className: 'py-3 px-4 text-left' }, 'Название'),
                React.createElement('th', { className: 'py-3 px-4 text-left' }, 'ID сборки'),
                React.createElement('th', { className: 'py-3 px-4 text-left' }, 'Глобальный статус'),
                React.createElement('th', { className: 'py-3 px-4 text-left' }, 'Действия')
              )
            ),
            React.createElement(
              'tbody',
              null,
              scenarios.map(scenario =>
                React.createElement(
                  'tr',
                  { key: scenario.id, className: 'border-t hover:bg-gray-50' },
                  React.createElement('td', { className: 'py-3 px-4' }, scenario.human_name || scenario.machine_name),
                  React.createElement('td', { className: 'py-3 px-4' }, getBuildName(scenario.build_id)),
                  React.createElement(
                    'td',
                    { className: 'py-3 px-4' },
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
                    { className: 'py-3 px-4 flex space-x-2' },
                    React.createElement(
                      'button',
                      {
                        onClick: () => handleEdit(scenario.id),
                        className: 'bg-green-600 text-white py-1 px-3 rounded hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 transition duration-200'
                      },
                      'Редактировать'
                    ),
                    React.createElement(
                      'button',
                      {
                        onClick: () => handleDelete(scenario.id),
                        className: 'bg-red-600 text-white py-1 px-3 rounded hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 transition duration-200'
                      },
                      'Удалить'
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
