console.log('Loading ScenarioEditor.jsx...');

if (!window.React || !window.axios) {
  console.error('ScenarioEditor.jsx: React or axios not loaded');
  throw new Error('React or axios not loaded');
}

const React = window.React;
const { useState, useEffect } = React;
const axios = window.axios;

function ScenarioEditor({ scenarioId, onClose }) {
  console.log('ScenarioEditor.jsx: Rendering', { scenarioId });
  const [humanName, setHumanName] = useState('');
  const [machineName, setMachineName] = useState('');
  const [buildId, setBuildId] = useState('');
  const [builds, setBuilds] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchBuilds();
    if (scenarioId) {
      fetchScenario(scenarioId);
    } else {
      setLoading(false);
    }
  }, []);

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

  const fetchScenario = async (id) => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get(`/api/scenarios/${id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const scenario = response.data.scenario || response.data;
      setHumanName(scenario.human_name || '');
      setMachineName(scenario.machine_name || '');
      setBuildId(scenario.build_id || '');
      setLoading(false);
    } catch (error) {
      console.error('Error fetching scenario:', error);
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const token = localStorage.getItem('token');
      const payload = { human_name: humanName, machine_name: machineName, build_id: parseInt(buildId) };
      
      if (scenarioId) {
        await axios.put(`/api/scenarios/${scenarioId}`, payload, {
          headers: { Authorization: `Bearer ${token}` }
        });
      } else {
        await axios.post('/api/scenarios', payload, {
          headers: { Authorization: `Bearer ${token}` }
        });
      }
      
      if (onClose) onClose();
      else {
        window.history.pushState({}, '', '/scenarios');
        window.dispatchEvent(new Event('popstate'));
      }
    } catch (error) {
      console.error('Error saving scenario:', error);
    } finally {
      setSaving(false);
    }
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
    { className: 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50' },
    React.createElement(
      'div',
      { className: 'bg-white rounded-lg p-6 w-full max-w-md' },
      React.createElement(
        'h2',
        { className: 'text-xl font-bold mb-4 text-gray-800' },
        scenarioId ? 'Редактировать сценарий' : 'Создать сценарий'
      ),
      React.createElement(
        'form',
        { onSubmit: handleSubmit },
        React.createElement(
          'div',
          { className: 'mb-4' },
          React.createElement(
            'label',
            { className: 'block text-sm font-medium text-gray-700 mb-1', htmlFor: 'human_name' },
            'Название'
          ),
          React.createElement(
            'input',
            {
              type: 'text',
              id: 'human_name',
              value: humanName,
              onChange: (e) => setHumanName(e.target.value),
              className: 'w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500',
              required: true
            }
          )
        ),
        React.createElement(
          'div',
          { className: 'mb-4' },
          React.createElement(
            'label',
            { className: 'block text-sm font-medium text-gray-700 mb-1', htmlFor: 'machine_name' },
            'Машинное имя'
          ),
          React.createElement(
            'input',
            {
              type: 'text',
              id: 'machine_name',
              value: machineName,
              onChange: (e) => setMachineName(e.target.value),
              className: 'w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500',
              required: true
            }
          )
        ),
        React.createElement(
          'div',
          { className: 'mb-6' },
          React.createElement(
            'label',
            { className: 'block text-sm font-medium text-gray-700 mb-1', htmlFor: 'build_id' },
            'Сборка'
          ),
          React.createElement(
            'select',
            {
              id: 'build_id',
              value: buildId,
              onChange: (e) => setBuildId(e.target.value),
              className: 'w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500',
              required: true
            },
            React.createElement('option', { value: '' }, 'Выберите сборку'),
            builds.map(build =>
              React.createElement('option', { key: build.id, value: build.id }, build.human_name)
            )
          )
        ),
        React.createElement(
          'div',
          { className: 'flex justify-end space-x-2' },
          React.createElement(
            'button',
            {
              type: 'button',
              onClick: onClose ? onClose : () => {
                window.history.pushState({}, '', '/scenarios');
                window.dispatchEvent(new Event('popstate'));
              },
              className: 'px-4 py-2 text-gray-700 bg-gray-200 rounded hover:bg-gray-300 focus:outline-none'
            },
            'Отмена'
          ),
          React.createElement(
            'button',
            {
              type: 'submit',
              disabled: saving,
              className: 'px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-50'
            },
            saving ? 'Сохранение...' : 'Сохранить'
          )
        )
      )
    )
  );
}

window.ScenarioEditor = ScenarioEditor;
console.log('ScenarioEditor.jsx: ScenarioEditor exported:', window.ScenarioEditor);
