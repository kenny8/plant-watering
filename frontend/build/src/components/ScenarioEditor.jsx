console.log('Loading ScenarioEditor.jsx...');

if (!window.React || !window.axios) {
  console.error('ScenarioEditor.jsx: React or axios not loaded');
  throw new Error('React or axios not loaded');
}

const React = window.React;
const { useState, useEffect, useRef } = React;
const axios = window.axios;

function ScenarioEditor({ scenarioId, onClose }) {
  console.log('ScenarioEditor.jsx: Rendering', { scenarioId });
  const [humanName, setHumanName] = useState('');
  const [machineName, setMachineName] = useState('');
  const [buildId, setBuildId] = useState('');
  const [builds, setBuilds] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [flowData, setFlowData] = useState(null);
  const [isActive, setIsActive] = useState(true);
  const editorRef = useRef(null);
  const drawflowContainerRef = useRef(null);

  // Initialize Drawflow editor
  useEffect(() => {
    if (drawflowContainerRef.current && window.Drawflow) {
      editorRef.current = new window.Drawflow(drawflowContainerRef.current);
      editorRef.current.reroute = true;
      editorRef.current.reroute_fix_curvature = true;
      
      // Set custom node styles
      editorRef.current.node_selected = 'drawflow_node_selected';
      
      return () => {
        if (editorRef.current) {
          editorRef.current.clear();
        }
      };
    }
  }, []);

  // Load build data and create nodes
  useEffect(() => {
    if (buildId && editorRef.current) {
      loadBuildAndCreateNodes(buildId);
    }
  }, [buildId]);

  // Import flow data when editing existing scenario
  useEffect(() => {
    if (flowData && editorRef.current) {
      try {
        editorRef.current.import(flowData);
      } catch (error) {
        console.error('Error importing flow data:', error);
      }
    }
  }, [flowData]);

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

  const loadBuildAndCreateNodes = async (id) => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get(`/api/builds/${id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const build = response.data.build || response.data;
      
      if (!build) return;

      const editor = editorRef.current;
      let yOffset = 50;
      let xOffset = 50;

      // Create Trigger nodes for post_fields (sensors)
      if (build.post_fields && Array.isArray(build.post_fields)) {
        build.post_fields.forEach((field, index) => {
          const html = `
            <div class="drawflow_node_header bg-blue-500 text-white px-3 py-2 rounded-t-lg font-medium">
              📡 ${field.name || field.field_name}
            </div>
            <div class="px-3 py-2 text-sm text-gray-600">
              <div><strong>Type:</strong> ${field.type || 'sensor'}</div>
              ${field.description ? `<div><strong>Desc:</strong> ${field.description}</div>` : ''}
            </div>
          `;
          
          editor.addNode(
            'trigger',
            1,
            1,
            xOffset,
            yOffset + (index * 180),
            field.field_name || `trigger_${index}`,
            {},
            html,
            'trigger',
            false,
            true
          );
        });
        xOffset += 250;
      }

      // Create Action nodes for get_fields (commands)
      if (build.get_fields && Array.isArray(build.get_fields)) {
        build.get_fields.forEach((field, index) => {
          let botParamsHtml = '';
          if (field.bot_parameters) {
            const params = Object.entries(field.bot_parameters).map(([key, value]) => {
              const checked = value === true || value === 'on' ? 'checked' : '';
              return `
                <label class="flex items-center space-x-2 text-xs">
                  <input type="checkbox" class="form-checkbox" ${checked} disabled />
                  <span>${key}</span>
                </label>
              `;
            }).join('');
            botParamsHtml = `<div class="mt-2 pt-2 border-t">${params}</div>`;
          }

          const html = `
            <div class="drawflow_node_header bg-green-500 text-white px-3 py-2 rounded-t-lg font-medium">
              ⚙️ ${field.name || field.field_name}
            </div>
            <div class="px-3 py-2 text-sm text-gray-600">
              <div><strong>Type:</strong> ${field.type || 'command'}</div>
              ${field.description ? `<div><strong>Desc:</strong> ${field.description}</div>` : ''}
              ${botParamsHtml}
            </div>
          `;
          
          editor.addNode(
            'action',
            1,
            1,
            xOffset,
            yOffset + (index * 180),
            field.field_name || `action_${index}`,
            {},
            html,
            'action',
            false,
            true
          );
        });
      }
    } catch (error) {
      console.error('Error loading build data:', error);
    }
  };

  const addConditionNode = () => {
    const editor = editorRef.current;
    const html = `
      <div class="drawflow_node_header bg-orange-500 text-white px-3 py-2 rounded-t-lg font-medium">
        🔀 Условие
      </div>
      <div class="px-3 py-2 text-sm">
        <div class="mb-2">
          <select class="w-full px-2 py-1 border rounded text-xs condition-operator">
            <option value=">">&gt; (больше)</option>
            <option value="<">&lt; (меньше)</option>
            <option value="==">== (равно)</option>
            <option value="!=">!= (не равно)</option>
            <option value=">=">&gt;= (больше или равно)</option>
            <option value="<=">&lt;= (меньше или равно)</option>
          </select>
        </div>
        <div>
          <input type="number" class="w-full px-2 py-1 border rounded text-xs condition-value" placeholder="Значение" />
        </div>
      </div>
    `;
    
    editor.addNode(
      'condition',
      1,
      1,
      400,
      50,
      `condition_${Date.now()}`,
      { operator: '>', value: 0 },
      html,
      'condition',
      false,
      true
    );
  };

  const addDayOfWeekNode = () => {
    const editor = editorRef.current;
    const days = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
    const checkboxes = days.map((day, index) => `
      <label class="flex items-center space-x-1 text-xs">
        <input type="checkbox" class="form-checkbox day-checkbox" data-day="${index}" />
        <span>${day}</span>
      </label>
    `).join('');
    
    const html = `
      <div class="drawflow_node_header bg-orange-500 text-white px-3 py-2 rounded-t-lg font-medium">
        📅 День недели
      </div>
      <div class="px-3 py-2 text-sm grid grid-cols-2 gap-1">
        ${checkboxes}
      </div>
    `;
    
    editor.addNode(
      'dayofweek',
      1,
      1,
      400,
      250,
      `dayofweek_${Date.now()}`,
      { days: [] },
      html,
      'dayofweek',
      false,
      true
    );
  };

  const addTimeNode = () => {
    const editor = editorRef.current;
    const html = `
      <div class="drawflow_node_header bg-orange-500 text-white px-3 py-2 rounded-t-lg font-medium">
        🕐 Время
      </div>
      <div class="px-3 py-2 text-sm">
        <input type="time" class="w-full px-2 py-1 border rounded text-xs time-input" />
      </div>
    `;
    
    editor.addNode(
      'time',
      1,
      1,
      400,
      400,
      `time_${Date.now()}`,
      { time: '' },
      html,
      'time',
      false,
      true
    );
  };

  const handleSave = async () => {
    if (!editorRef.current) return;
    
    setSaving(true);
    try {
      const token = localStorage.getItem('token');
      const exportedData = editorRef.current.export();
      
      const payload = { 
        human_name: humanName, 
        machine_name: machineName, 
        build_id: parseInt(buildId),
        flow_data: exportedData,
        is_active: isActive
      };
      
      if (scenarioId) {
        await axios.put(`/api/scenarios/${scenarioId}`, payload, {
          headers: { Authorization: `Bearer ${token}` }
        });
      } else {
        await axios.post('/api/scenarios', payload, {
          headers: { Authorization: `Bearer ${token}` }
        });
      }
      
      // After save, redirect to main page
      window.history.pushState({}, '', '/');
      window.dispatchEvent(new Event('popstate'));
    } catch (error) {
      console.error('Error saving scenario:', error);
    } finally {
      setSaving(false);
    }
  };

  useEffect(() => {
    fetchBuilds();
    if (scenarioId) {
      fetchScenario(scenarioId);
    } else {
      setLoading(false);
    }
  }, []);

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
      setFlowData(scenario.flow_data || null);
      setIsActive(scenario.is_active !== undefined ? scenario.is_active : true);
      setLoading(false);
    } catch (error) {
      console.error('Error fetching scenario:', error);
      setLoading(false);
    }
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
    { className: 'container mx-auto p-6' },
    React.createElement(
      'div',
      { className: 'bg-white rounded-lg shadow-md p-6' },
      React.createElement(
        'h2',
        { className: 'text-xl font-bold mb-4 text-gray-800' },
        scenarioId ? 'Редактировать сценарий' : 'Создать сценарий'
      ),
      React.createElement(
        'form',
        { onSubmit: (e) => e.preventDefault() },
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
        )
      ),
      // Drawflow Editor Section
      React.createElement(
        'div',
        { className: 'mb-6' },
        React.createElement(
          'div',
          { className: 'flex items-center justify-between mb-2' },
          React.createElement(
            'h3',
            { className: 'text-lg font-semibold text-gray-800' },
            'Визуальный редактор'
          ),
          React.createElement(
            'div',
            { className: 'flex space-x-2' },
            React.createElement(
              'button',
              {
                type: 'button',
                onClick: addConditionNode,
                className: 'px-3 py-1 bg-orange-500 text-white text-sm rounded hover:bg-orange-600 focus:outline-none'
              },
              '+ Условие'
            ),
            React.createElement(
              'button',
              {
                type: 'button',
                onClick: addDayOfWeekNode,
                className: 'px-3 py-1 bg-orange-500 text-white text-sm rounded hover:bg-orange-600 focus:outline-none'
              },
              '+ День недели'
            ),
            React.createElement(
              'button',
              {
                type: 'button',
                onClick: addTimeNode,
                className: 'px-3 py-1 bg-orange-500 text-white text-sm rounded hover:bg-orange-600 focus:outline-none'
              },
              '+ Время'
            )
          )
        ),
        React.createElement(
          'div',
          {
            ref: drawflowContainerRef,
            id: 'drawflow',
            className: 'w-full h-[600px] border border-gray-300 rounded-lg overflow-hidden',
            style: {
              background: 'radial-gradient(#dbe2e9 1px, transparent 1px)',
              backgroundSize: '20px 20px'
            }
          }
        )
      ),
      // Status toggle
      React.createElement(
        'div',
        { className: 'mb-6 flex items-center' },
        React.createElement(
          'label',
          { className: 'flex items-center cursor-pointer' },
          React.createElement(
            'div',
            { className: 'relative' },
            React.createElement('input', {
              type: 'checkbox',
              className: 'sr-only',
              checked: isActive,
              onChange: (e) => setIsActive(e.target.checked)
            }),
            React.createElement(
              'div',
              {
                className: `block w-14 h-8 rounded-full transition-colors ${isActive ? 'bg-green-600' : 'bg-gray-300'}`
              }
            ),
            React.createElement(
              'div',
              {
                className: `absolute left-1 top-1 bg-white w-6 h-6 rounded-full transition-transform ${isActive ? 'translate-x-6' : ''}`
              }
            )
          ),
          React.createElement(
            'span',
            { className: 'ml-3 text-sm font-medium text-gray-700' },
            'Глобально включен'
          )
        )
      ),
      // Action buttons
      React.createElement(
        'div',
        { className: 'flex justify-end space-x-2' },
        React.createElement(
          'button',
          {
            type: 'button',
            onClick: onClose ? onClose : () => {
              window.history.pushState({}, '', '/');
              window.dispatchEvent(new Event('popstate'));
            },
            className: 'px-4 py-2 text-gray-700 bg-gray-200 rounded hover:bg-gray-300 focus:outline-none'
          },
          'Отмена'
        ),
        React.createElement(
          'button',
          {
            type: 'button',
            onClick: handleSave,
            disabled: saving,
            className: 'px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-50'
          },
          saving ? 'Сохранение...' : 'Сохранить'
        )
      )
    )
  );
}

window.ScenarioEditor = ScenarioEditor;
console.log('ScenarioEditor.jsx: ScenarioEditor exported:', window.ScenarioEditor);
