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

  // Initialize Drawflow editor - ТОЛЬКО ОДИН РАЗ при монтировании
  useEffect(() => {
    console.log('=== Drawflow useEffect started ===');
    
    if (!drawflowContainerRef.current) {
      console.error('Container not ready');
      return;
    }
    
    if (typeof window.Drawflow === 'undefined') {
      console.error('Drawflow library not loaded');
      return;
    }
    
    // Очищаем контейнер перед созданием
    drawflowContainerRef.current.innerHTML = '';
    
    // Создаем новый экземпляр Drawflow
    const editor = new window.Drawflow(drawflowContainerRef.current);
    editorRef.current = editor;
    console.log('Drawflow instance created:', editor);
    
    // Базовые настройки ДО start()
    editor.reroute = true;
    editor.reroute_fix_curvature = true;
    editor.force_first_input = false;
    editor.draggable_nodes = true;
    
    // ВАЖНО: Сначала start(), потом всё остальное
    editor.start();
    console.log('Drawflow editor started successfully!');
    
    // Добавляем обработчики событий
    editor.on('nodeCreated', (nodeId) => console.log('Node created:', nodeId));
    editor.on('nodeRemoved', (nodeId) => console.log('Node removed:', nodeId));
    editor.on('connectionCreated', (connection) => console.log('Connection created:', connection));
    editor.on('connectionRemoved', (connection) => console.log('Connection removed:', connection));
    editor.on('nodeSelected', (nodeId) => console.log('Node selected:', nodeId));
    editor.on('nodeMoved', (nodeId, nodeData) => console.log('Node moved:', nodeId, nodeData));
    editor.on('dragStart', (nodeId) => console.log('Drag start:', nodeId));
    editor.on('dragEnd', (nodeId) => console.log('Drag end:', nodeId));
    
    // Инициализируем модуль по умолчанию
    editor.addModule('default', {});
    editor.changeModule('default');
    console.log('Current module:', editor.module);
    
    // Если есть flowData, импортируем его
    if (flowData) {
      try {
        editor.import(flowData);
        console.log('✓ flowData imported');
      } catch (error) {
        console.error('✗ Error importing flow data:', error);
      }
    }
    
    // ОЧИСТКА: вызываем stop() для удаления всех слушателей событий
    return () => {
      console.log('Cleanup: stopping Drawflow editor...');
      if (editorRef.current) {
        try {
          editorRef.current.stop();
        } catch (e) {
          console.error('Error stopping editor:', e);
        }
        editorRef.current = null;
      }
      if (drawflowContainerRef.current) {
        drawflowContainerRef.current.innerHTML = '';
      }
    };
  }, []); // Пустой массив - только при монтировании

  // Отдельный эффект для импорта flowData - УДАЛЕНО дублирование инициализации
  useEffect(() => {
    if (flowData && editorRef.current) {
      try {
        console.log('Importing flowData in separate effect...');
        editorRef.current.import(flowData);
        console.log('✓ flowData imported successfully');
      } catch (error) {
        console.error('Error importing flow data:', error);
      }
    }
  }, [flowData]);
  
  // Load build data and create nodes - ВАЖНО: не очищать узлы перед загрузкой
  useEffect(() => {
    if (buildId && editorRef.current) {
      loadBuildAndCreateNodes(buildId, false); // false = не очищать существующие узлы
    }
  }, [buildId]);

  // Import flow data when editing existing scenario - УДАЛЕНО дублирование
  // (уже есть в useEffect на строке 156)

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

  const loadBuildAndCreateNodes = async (id, clearExisting = true) => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get(`/api/builds/${id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const build = response.data.build || response.data;
      
      if (!build) return;

      const editor = editorRef.current;
      
      // Проверка и инициализация модуля перед добавлением узлов
      if (!editor.module || !editor.version) {
        console.log('Initializing module in loadBuildAndCreateNodes...');
        try {
          editor.addModule('default', {});
          editor.changeModule('default');
          console.log('Module initialized:', editor.module);
        } catch (moduleError) {
          console.error('Failed to initialize module in loadBuildAndCreateNodes:', moduleError);
          return;
        }
      }
      
      // ВАЖНО: Если clearExisting = false, НЕ очищаем узлы - просто добавляем новые
      // Это позволяет добавлять узлы без удаления уже созданных условий
      if (clearExisting) {
        console.log('Clearing existing nodes before loading build data...');
        // Получаем все ID узлов и удаляем их через стандартный метод removeNode
        // Копируем массив nodeIds, так как editor.nodes будет изменяться во время удаления
        const nodeIds = [...Object.keys(editor.nodes || {})];
        nodeIds.forEach(nodeId => {
          try {
            // Используем стандартный метод removeNode вместо removeNodeFromData
            editor.removeNode(nodeId);
          } catch (e) {
            console.error('Error removing node:', e);
          }
        });
      } else {
        console.log('Preserving existing nodes (conditions, etc.) while adding build nodes...');
      }
      
      let yOffset = 50;
      let xOffset = 50;

      // Create Trigger nodes for post_fields (sensors)
      if (build.post_fields && Array.isArray(build.post_fields)) {
        build.post_fields.forEach((field, index) => {
          const html = `
            <div class="title-box" style="background:#3b82f6; color:white; padding:10px; border-radius:8px 8px 0 0; font-weight:bold;">
              📡 ${field.name || field.field_name}
            </div>
            <div class="box" style="padding:10px;">
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
            false
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
            <div class="title-box" style="background:#22c55e; color:white; padding:10px; border-radius:8px 8px 0 0; font-weight:bold;">
              ⚙️ ${field.name || field.field_name}
            </div>
            <div class="box" style="padding:10px;">
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
            false
          );
        });
      }
    } catch (error) {
      console.error('Error loading build data:', error);
    }
  };

  // Helper function to get all nodes from editor
  const getAllNodes = (editor) => {
    if (!editor || !editor.nodes) return [];
    return Object.values(editor.nodes);
  };

  const addConditionNode = () => {
    console.log('=== addConditionNode called ===');
    console.log('editorRef.current:', editorRef.current);
    console.log('typeof window.Drawflow:', typeof window.Drawflow);
    
    if (!editorRef.current) {
      console.error('ERROR: Editor not initialized yet! editorRef.current is null');
      console.error('Drawflow loaded?', typeof window.Drawflow !== 'undefined');
      console.error('Container ref?', drawflowContainerRef.current);
      return;
    }
    
    const editor = editorRef.current;
    console.log('Adding Condition node, editor instance:', editor);
    console.log('Editor methods:', Object.getOwnPropertyNames(Object.getPrototypeOf(editor)));
    console.log('Current module:', editor.module);
    console.log('Module version:', editor.version);
    
    // Проверка модуля перед добавлением узла
    if (!editor.module || !editor.version) {
      console.error('ERROR: Module not initialized! Trying to initialize now...');
      try {
        editor.addModule('default', {});
        editor.changeModule('default');
        console.log('Module initialized on-the-fly:', editor.module);
      } catch (moduleError) {
        console.error('Failed to initialize module:', moduleError);
        alert('Ошибка инициализации Drawflow. Пожалуйста, обновите страницу.');
        return;
      }
    }
    
    // Вычисляем позицию для новой ноды - справа от существующих
    const existingNodes = getAllNodes(editor);
    const maxX = existingNodes && existingNodes.length > 0 
      ? Math.max(...existingNodes.map(n => n.pos_x)) 
      : 300;
    const newY = 50 + (existingNodes.length * 50); // Смещаем по Y для каждого нового условия
    
    const html = `
      <div class="title-box" style="background:#f97316; color:white; padding:10px; border-radius:8px 8px 0 0; font-weight:bold;">
        🔀 Условие
      </div>
      <div class="box" style="padding:10px;">
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
    
    // addNode принимает 9 аргументов: name, inputs, outputs, x, y, class, data, html, typenode
    try {
      console.log('Calling editor.addNode with args:', ['condition', 1, 1, maxX + 50, newY, 'condition', { operator: '>', value: 0 }, html, false]);
      editor.addNode(
        'condition',
        1,
        1, // 1 выход (как у остальных)
        maxX + 50,
        newY,
        'condition',
        { operator: '>', value: 0 },
        html,
        false
      );
      console.log('✓ Condition node added successfully');
    } catch (error) {
      console.error('✗ ERROR adding condition node:', error);
      console.error('Error stack:', error.stack);
      console.error('Error details:', {
        message: error.message,
        name: error.name,
        stack: error.stack
      });
    }
  };

  const addDayOfWeekNode = () => {
    console.log('=== addDayOfWeekNode called ===');
    console.log('editorRef.current:', editorRef.current);
    console.log('typeof window.Drawflow:', typeof window.Drawflow);
    
    if (!editorRef.current) {
      console.error('ERROR: Editor not initialized yet! editorRef.current is null');
      console.error('Drawflow loaded?', typeof window.Drawflow !== 'undefined');
      console.error('Container ref?', drawflowContainerRef.current);
      return;
    }
    
    const editor = editorRef.current;
    console.log('Adding Day of Week node, editor instance:', editor);
    console.log('Editor methods:', Object.getOwnPropertyNames(Object.getPrototypeOf(editor)));
    console.log('Current module:', editor.module);
    console.log('Module version:', editor.version);
    
    // Проверка модуля перед добавлением узла
    if (!editor.module || !editor.version) {
      console.error('ERROR: Module not initialized! Trying to initialize now...');
      try {
        editor.addModule('default', {});
        editor.changeModule('default');
        console.log('Module initialized on-the-fly:', editor.module);
      } catch (moduleError) {
        console.error('Failed to initialize module:', moduleError);
        alert('Ошибка инициализации Drawflow. Пожалуйста, обновите страницу.');
        return;
      }
    }
    
    // Вычисляем позицию для новой ноды - справа от существующих
    const existingNodes = getAllNodes(editor);
    const maxX = existingNodes && existingNodes.length > 0 
      ? Math.max(...existingNodes.map(n => n.pos_x)) 
      : 300;
    const newY = 50 + (existingNodes.length * 50);
    
    const days = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
    const checkboxes = days.map((day, index) => `
      <label class="flex items-center space-x-1 text-xs">
        <input type="checkbox" class="form-checkbox day-checkbox" data-day="${index}" />
        <span>${day}</span>
      </label>
    `).join('');
    
    const html = `
      <div class="title-box" style="background:#f97316; color:white; padding:10px; border-radius:8px 8px 0 0; font-weight:bold;">
        📅 День недели
      </div>
      <div class="box" style="padding:10px;">
        ${checkboxes}
      </div>
    `;
    
    // addNode принимает 9 аргументов: name, inputs, outputs, x, y, class, data, html, typenode
    try {
      console.log('Calling editor.addNode with args:', ['dayofweek', 1, 1, maxX + 50, newY, 'dayofweek', { days: [] }, html, false]);
      editor.addNode(
        'dayofweek',
        1,
        1,
        maxX + 50,
        newY,
        'dayofweek',
        { days: [] },
        html,
        false
      );
      console.log('✓ Day of Week node added successfully');
    } catch (error) {
      console.error('✗ ERROR adding day of week node:', error);
      console.error('Error stack:', error.stack);
      console.error('Error details:', {
        message: error.message,
        name: error.name,
        stack: error.stack
      });
    }
  };

  const addTimeNode = () => {
    console.log('=== addTimeNode called ===');
    console.log('editorRef.current:', editorRef.current);
    console.log('typeof window.Drawflow:', typeof window.Drawflow);
    
    if (!editorRef.current) {
      console.error('ERROR: Editor not initialized yet! editorRef.current is null');
      console.error('Drawflow loaded?', typeof window.Drawflow !== 'undefined');
      console.error('Container ref?', drawflowContainerRef.current);
      return;
    }
    
    const editor = editorRef.current;
    console.log('Adding Time node, editor instance:', editor);
    console.log('Editor methods:', Object.getOwnPropertyNames(Object.getPrototypeOf(editor)));
    console.log('Current module:', editor.module);
    console.log('Module version:', editor.version);
    
    // Проверка модуля перед добавлением узла
    if (!editor.module || !editor.version) {
      console.error('ERROR: Module not initialized! Trying to initialize now...');
      try {
        editor.addModule('default', {});
        editor.changeModule('default');
        console.log('Module initialized on-the-fly:', editor.module);
      } catch (moduleError) {
        console.error('Failed to initialize module:', moduleError);
        alert('Ошибка инициализации Drawflow. Пожалуйста, обновите страницу.');
        return;
      }
    }
    
    // Вычисляем позицию для новой ноды - справа от существующих
    const existingNodes = getAllNodes(editor);
    const maxX = existingNodes && existingNodes.length > 0 
      ? Math.max(...existingNodes.map(n => n.pos_x)) 
      : 300;
    const newY = 50 + (existingNodes.length * 50);
    
    const html = `
      <div class="title-box" style="background:#f97316; color:white; padding:10px; border-radius:8px 8px 0 0; font-weight:bold;">
        🕐 Время
      </div>
      <div class="box" style="padding:10px;">
        <input type="time" class="w-full px-2 py-1 border rounded text-xs time-input" />
      </div>
    `;
    
    // addNode принимает 9 аргументов: name, inputs, outputs, x, y, class, data, html, typenode
    try {
      console.log('Calling editor.addNode with args:', ['time', 1, 1, maxX + 50, newY, 'time', { time: '' }, html, false]);
      editor.addNode(
        'time',
        1,
        1,
        maxX + 50,
        newY,
        'time',
        { time: '' },
        html,
        false
      );
      console.log('✓ Time node added successfully');
    } catch (error) {
      console.error('✗ ERROR adding time node:', error);
      console.error('Error stack:', error.stack);
      console.error('Error details:', {
        message: error.message,
        name: error.name,
        stack: error.stack
      });
    }
  };

  // Функция для добавления ноды данных (Trigger из post_fields)
  const addDataNode = () => {
    console.log('=== addDataNode called ===');
    
    if (!editorRef.current) {
      console.error('ERROR: Editor not initialized yet! editorRef.current is null');
      return;
    }
    
    const editor = editorRef.current;
    
    // Проверка модуля перед добавлением узла
    if (!editor.module || !editor.version) {
      console.error('ERROR: Module not initialized! Trying to initialize now...');
      try {
        editor.addModule('default', {});
        editor.changeModule('default');
        console.log('Module initialized on-the-fly:', editor.module);
      } catch (moduleError) {
        console.error('Failed to initialize module:', moduleError);
        alert('Ошибка инициализации Drawflow. Пожалуйста, обновите страницу.');
        return;
      }
    }
    
    // Вычисляем позицию для новой ноды - справа от существующих
    const existingNodes = getAllNodes(editor);
    const maxX = existingNodes && existingNodes.length > 0 
      ? Math.max(...existingNodes.map(n => n.pos_x)) 
      : 300;
    const newY = 50 + (existingNodes.length * 50);
    
    // Получаем список доступных полей из выбранной сборки
    const selectedBuild = builds.find(b => b.id == buildId);
    const postFields = selectedBuild?.post_fields || [];
    
    const fieldOptions = postFields.map((field, index) => 
      `<option value="${field.field_name}">${field.name || field.field_name}</option>`
    ).join('');
    
    const html = `
      <div class="title-box" style="background:#3b82f6; color:white; padding:10px; border-radius:8px 8px 0 0; font-weight:bold;">
        📡 Данные (POST)
      </div>
      <div class="box" style="padding:10px;">
        <div class="mb-2">
          <label class="block text-xs text-gray-600 mb-1">Поле:</label>
          <select class="w-full px-2 py-1 border rounded text-xs data-field-select">
            <option value="">Выберите поле</option>
            ${fieldOptions}
          </select>
        </div>
      </div>
    `;
    
    try {
      editor.addNode(
        'data',
        1,
        1,
        maxX + 50,
        newY,
        'data',
        { field_name: '', type: 'post' },
        html,
        false
      );
      console.log('✓ Data node added successfully');
    } catch (error) {
      console.error('✗ ERROR adding data node:', error);
    }
  };

  // Функция для добавления ноды действия (Action из get_fields)
  const addActionNode = () => {
    console.log('=== addActionNode called ===');
    
    if (!editorRef.current) {
      console.error('ERROR: Editor not initialized yet! editorRef.current is null');
      return;
    }
    
    const editor = editorRef.current;
    
    // Проверка модуля перед добавлением узла
    if (!editor.module || !editor.version) {
      console.error('ERROR: Module not initialized! Trying to initialize now...');
      try {
        editor.addModule('default', {});
        editor.changeModule('default');
        console.log('Module initialized on-the-fly:', editor.module);
      } catch (moduleError) {
        console.error('Failed to initialize module:', moduleError);
        alert('Ошибка инициализации Drawflow. Пожалуйста, обновите страницу.');
        return;
      }
    }
    
    // Вычисляем позицию для новой ноды - справа от существующих
    const existingNodes = getAllNodes(editor);
    const maxX = existingNodes && existingNodes.length > 0 
      ? Math.max(...existingNodes.map(n => n.pos_x)) 
      : 300;
    const newY = 50 + (existingNodes.length * 50);
    
    // Получаем список доступных полей из выбранной сборки
    const selectedBuild = builds.find(b => b.id == buildId);
    const getFields = selectedBuild?.get_fields || [];
    
    const fieldOptions = getFields.map((field, index) => 
      `<option value="${field.field_name}">${field.name || field.field_name}</option>`
    ).join('');
    
    const html = `
      <div class="title-box" style="background:#22c55e; color:white; padding:10px; border-radius:8px 8px 0 0; font-weight:bold;">
        ⚙️ Действие (GET)
      </div>
      <div class="box" style="padding:10px;">
        <div class="mb-2">
          <label class="block text-xs text-gray-600 mb-1">Команда:</label>
          <select class="w-full px-2 py-1 border rounded text-xs action-field-select">
            <option value="">Выберите команду</option>
            ${fieldOptions}
          </select>
        </div>
        <div class="bot-params-container mt-2 pt-2 border-t">
          <label class="block text-xs text-gray-600 mb-1">Параметры:</label>
          <div class="bot-params-list space-y-1"></div>
        </div>
      </div>
    `;
    
    try {
      editor.addNode(
        'action',
        1,
        1,
        maxX + 50,
        newY,
        'action',
        { field_name: '', type: 'get', bot_parameters: {} },
        html,
        false
      );
      console.log('✓ Action node added successfully');
    } catch (error) {
      console.error('✗ ERROR adding action node:', error);
    }
  };

  const handleSave = async () => {
    if (!editorRef.current) return;
    
    setSaving(true);
    try {
      const token = localStorage.getItem('token');
      const exportedData = editorRef.current.export();
      
      // Проверка buildId перед отправкой
      if (!buildId) {
        alert('Пожалуйста, выберите сборку');
        setSaving(false);
        return;
      }
      
      const payload = { 
        human_name: humanName, 
        machine_name: machineName, 
        build_id: parseInt(buildId),
        // Сериализуем flow_data в JSON строку для бэкенда
        flow_data: JSON.stringify(exportedData),
        is_active: isActive
      };
      
      console.log('Saving scenario with payload:', payload);
      
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
      alert('Ошибка при сохранении: ' + (error.response?.data?.detail || error.message));
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
      // Парсим flow_data, если это строка JSON
      let parsedFlowData = scenario.flow_data;
      if (typeof scenario.flow_data === 'string') {
        try {
          parsedFlowData = JSON.parse(scenario.flow_data);
        } catch (e) {
          console.error('Error parsing flow_data:', e);
          parsedFlowData = null;
        }
      }
      setFlowData(parsedFlowData);
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
                onClick: () => {
                  console.log('Data button clicked, editor:', editorRef.current);
                  addDataNode();
                },
                className: 'px-3 py-1 bg-blue-500 text-white text-sm rounded hover:bg-blue-600 focus:outline-none'
              },
              '+ Данные'
            ),
            React.createElement(
              'button',
              {
                type: 'button',
                onClick: () => {
                  console.log('Action button clicked, editor:', editorRef.current);
                  addActionNode();
                },
                className: 'px-3 py-1 bg-green-500 text-white text-sm rounded hover:bg-green-600 focus:outline-none'
              },
              '+ Действия'
            ),
            React.createElement(
              'button',
              {
                type: 'button',
                onClick: () => {
                  console.log('Condition button clicked, editor:', editorRef.current);
                  addConditionNode();
                },
                className: 'px-3 py-1 bg-orange-500 text-white text-sm rounded hover:bg-orange-600 focus:outline-none'
              },
              '+ Условие'
            ),
            React.createElement(
              'button',
              {
                type: 'button',
                onClick: () => {
                  console.log('Day of Week button clicked, editor:', editorRef.current);
                  addDayOfWeekNode();
                },
                className: 'px-3 py-1 bg-orange-500 text-white text-sm rounded hover:bg-orange-600 focus:outline-none'
              },
              '+ День недели'
            ),
            React.createElement(
              'button',
              {
                type: 'button',
                onClick: () => {
                  console.log('Time button clicked, editor:', editorRef.current);
                  addTimeNode();
                },
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
            className: 'w-full h-[600px] border border-gray-300 rounded-lg parent-drawflow',
            style: { 
              position: 'relative', 
              overflow: 'hidden',
              userSelect: 'none',
              touchAction: 'none'
            },
            onDragOver: (e) => e.preventDefault()
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
