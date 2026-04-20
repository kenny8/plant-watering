console.log('Loading DeviceScenariosPage.jsx...');

if (!window.React || !window.axios) {
  console.error('DeviceScenariosPage.jsx: React or axios not loaded');
  throw new Error('React or axios not loaded');
}

const React = window.React;
const { useState, useEffect } = React;
const axios = window.axios;

function DeviceScenariosPage() {
  console.log('DeviceScenariosPage.jsx: Rendering');
  const [scenarios, setScenarios] = useState([]);
  const [deviceId, setDeviceId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    // Получаем ID устройства из URL
    const pathParts = window.location.pathname.split('/');
    const id = pathParts[pathParts.length - 1];
    setDeviceId(id);
    fetchDeviceScenarios(id);
  }, []);

  const fetchDeviceScenarios = async (id) => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get(`/api/devices/${id}/scenarios`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setScenarios(response.data.scenarios || response.data || []);
      setLoading(false);
    } catch (error) {
      console.error('Error fetching device scenarios:', error);
      setError('Ошибка при загрузке сценариев');
      setLoading(false);
    }
  };

  const handleToggle = async (scenarioId, currentStatus) => {
    if (!deviceId) {
      console.error('Device ID not set');
      return;
    }
    try {
      const token = localStorage.getItem('token');
      // Используем endpoint для переключения статуса сценария на устройстве
      await axios.patch(`/api/devices/${deviceId}/scenarios/${scenarioId}/toggle`, {}, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setScenarios(scenarios.map(s =>
        s.id === scenarioId ? { ...s, is_enabled: !s.is_enabled } : s
      ));
    } catch (error) {
      console.error('Error toggling scenario:', error);
    }
  };


  const handleDelete = async (scenarioId) => {
    try {
      const token = localStorage.getItem('token');
      await axios.delete(`/api/scenarios/${scenarioId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setScenarios(scenarios.filter(s => s.id !== scenarioId));
    } catch (error) {
      console.error('Error deleting scenario:', error);
    }
  };

  const handleEdit = (scenarioId) => {
    window.history.pushState({}, '', `/scenarios/edit/${scenarioId}`);
    window.dispatchEvent(new Event('popstate'));
  };

  const handleBack = () => {
    window.history.pushState({}, '', '/devices');
    window.dispatchEvent(new Event('popstate'));
  };

  if (loading) {
    return React.createElement(
      'div',
      { className: 'flex flex-col items-center min-h-screen bg-gray-100 py-8' },
      React.createElement(
        'div',
        { className: 'w-full max-w-4xl' },
        React.createElement('div', { className: 'text-xl text-center' }, 'Загрузка...')
      )
    );
  }

  return React.createElement(
    'div',
    { className: 'flex flex-col items-center min-h-screen bg-gray-100 py-8' },
    React.createElement(
      'div',
      { className: 'w-full max-w-4xl' },
      React.createElement(
        'button',
        {
          onClick: handleBack,
          className: 'mb-4 bg-gray-600 text-white py-2 px-4 rounded hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-gray-500 transition duration-200'
        },
        '← Назад к устройствам'
      ),
      React.createElement('h1', { className: 'text-2xl font-bold text-center text-blue-600 mb-6' }, 'Сценарии устройства'),
      error && React.createElement('p', { className: 'text-red-500 text-center mb-4' }, error),
      scenarios.length === 0 && !error
        ? React.createElement(
            'div',
            { className: 'text-center' },
            React.createElement('p', { className: 'text-gray-600 mb-4' }, 'У этого устройства нет сценариев')
          )
        : React.createElement(
            'table',
            { className: 'w-full bg-white shadow-md rounded-lg overflow-hidden' },
            React.createElement(
              'thead',
              { className: 'bg-blue-600 text-white' },
              React.createElement(
                'tr',
                null,
                React.createElement('th', { className: 'py-3 px-4 text-left' }, 'ID'),
                React.createElement('th', { className: 'py-3 px-4 text-left' }, 'Название'),
                React.createElement('th', { className: 'py-3 px-4 text-left' }, 'Статус')
              )
            ),
            React.createElement(
              'tbody',
              null,
              scenarios.map(scenario =>
                React.createElement(
                  'tr',
                  { key: scenario.id, className: 'border-t hover:bg-gray-50' },
                  React.createElement('td', { className: 'py-3 px-4' }, scenario.id),
                  React.createElement('td', { className: 'py-3 px-4' }, scenario.scenario?.human_name || scenario.human_name || scenario.machine_name || scenario.scenario?.machine_name),
                  React.createElement(
                    'td',
                    { className: 'py-3 px-4' },
                    React.createElement(
                      'button',
                      {
                        onClick: () => handleToggle(scenario.id, scenario.is_enabled),
                        className: `relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${scenario.is_enabled ? 'bg-green-600' : 'bg-gray-300'}`
                      },
                      React.createElement(
                        'span',
                        {
                          className: `inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${scenario.is_enabled ? 'translate-x-6' : 'translate-x-1'}`
                        }
                      )
                    )
                  )
                )
              )
            )
          )
    )
  );
}

window.DeviceScenariosPage = DeviceScenariosPage;
console.log('DeviceScenariosPage.jsx: DeviceScenariosPage exported:', window.DeviceScenariosPage);
