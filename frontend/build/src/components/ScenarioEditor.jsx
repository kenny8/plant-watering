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
  // Убрали flowData state - теперь не используем его для синхронизации
  const [isActive, setIsActive] = useState(true);
  const editorRef = useRef(null);
  const drawflowContainerRef = useRef(null);

  // Initialize Drawflow editor - ТОЛЬКО ОДИН РАЗ при монтировании
  useEffect(() => {
    let timer;
    
    const initDrawflow = () => {
      console.log('=== initDrawflow called ===');
      console.log('drawflowContainerRef.current:', drawflowContainerRef.current);
      console.log('typeof window.Drawflow:', typeof window.Drawflow);
      
      if (drawflowContainerRef.current && typeof window.Drawflow !== 'undefined' && !editorRef.current) {
        try {
          // Создаем новый экземпляр ТОЛЬКО если его еще нет
          console.log('Creating new Drawflow instance...');
          const editor = new window.Drawflow(drawflowContainerRef.current);
          editorRef.current = editor;
          console.log('Drawflow instance created:', editor);

          // Базовые настройки
          console.log('Setting basic config...');
          editor.reroute = true;
          editor.reroute_fix_curvature = true;
          
          // Отключаем force_first_input для разрешения множественных соединений
          editor.force_first_input = false;
          
          // Включаем режим перетаскивания узлов
          editor.draggable_nodes = true;

          // КРИТИЧЕСКИ ВАЖНО: сначала start(), потом всё остальное
          console.log('Calling editor.start()...');
          editor.start(); 
          
          // Добавляем обработчики событий для отладки
          editor.on('nodeCreated', (nodeId) => {
            console.log('Node created:', nodeId);
          });
          editor.on('nodeRemoved', (nodeId) => {
            console.log('Node removed:', nodeId);
          });
          editor.on('connectionCreated', (connection) => {
            console.log('Connection created:', connection);
          });
          editor.on('connectionRemoved', (connection) => {
            console.log('Connection removed:', connection);
          }); 
          
          console.log('✓ Drawflow editor started successfully!');
          console.log('Editor state after start:', {
            hasNodes: editor.drawflow && editor.drawflow[editor.module] ? Object.keys(editor.drawflow[editor.module].data || {}).length > 0 : false,
            reroute: editor.reroute,
            container: editor.container,
            module: editor.module
          });

          // Инициализируем модуль по умолчанию (КРИТИЧЕСКИ ВАЖНО для addNode!)
          console.log('Initializing default module...');
          try {
            editor.addModule('default', {});
            editor.changeModule('default');
            console.log('Current module:', editor.module);
            console.log('Module version:', editor.version);
          } catch (moduleError) {
            console.error('Error initializing module:', moduleError);
          }
          
        } catch (error) {
          console.error('✗ CRITICAL ERROR during Drawflow init:', error);
          console.error('Error stack:', error.stack);
        }
      } else {
        console.log('Waiting for container or Drawflow library or editor already exists...');
        console.log('Container ready?', !!drawflowContainerRef.current);
        console.log('Drawflow loaded?', typeof window.Drawflow !== 'undefined');
        console.log('Editor already exists?', !!editorRef.current);
        timer = setTimeout(initDrawflow, 100);
      }
    };
    
    console.log('Starting Drawflow initialization...');
    initDrawflow();

    // ПРАВИЛЬНАЯ ОЧИСТКА ДЛЯ REACT
    return () => {
      console.log('Cleanup: clearing timer and stopping editor...');
      if (timer) clearTimeout(timer);
      // НЕ очищаем editorRef.current и контейнер при размонтировании
      // Это позволяет сохранить узлы между рендерами React
      console.log('Cleanup complete (preserving editor state)');
    };
  }, []); // Пустой массив - только при монтировании

  // Load build data and create nodes - ТЕПЕРЬ ВСЕГДА ДОБАВЛЯЕМ БЕЗ ОЧИСТКИ
  useEffect(() => {
    if (buildId && editorRef.current) {
      console.log('BuildId changed, loading build data WITHOUT clearing existing nodes...');
      // Всегда передаем false - НЕ очищать существующие узлы
      loadBuildAndCreateNodes(buildId, false);
    }
  }, [buildId]);

  // Import flow data ONLY ONCE during initial editor setup - ИМПОРТИРУЕМ ТОЛЬКО ОДИН РАЗ
  // FlowData должен импортироваться только один раз при первой загрузке сценария
  const hasImportedFlowData = useRef(false);
  
  useEffect(() => {
    if (scenarioId && editorRef.current && !hasImportedFlowData.current) {
      // Загружаем данные сценария и импортируем flow_data
      fetchScenario(scenarioId).then((parsedFlowData) => {
        if (parsedFlowData && editorRef.current) {
          console.log('Importing flowData (only on initial load)...');
          hasImportedFlowData.current = true;
          editorRef.current.import(parsedFlowData);
          console.log('✓ flowData imported successfully');
        }
      });
    }
  }, [scenarioId]);

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

  const loadBuildAndCreateNodes = async (id, clearExisting = false) => {
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
      
      // ТЕПЕРЬ ПО УМОЛЧАНИЮ НЕ ОЧИЩАЕМ узлы - просто добавляем новые
      // Это позволяет добавлять узлы без удаления уже созданных условий
      if (clearExisting) {
        console.log('Clearing existing nodes before loading build data...');
        // Получаем все ID узлов из текущего модуля и удаляем их через стандартный метод removeNode
        const moduleData = editor.drawflow[editor.module];
        if (moduleData && moduleData.data) {
          const nodeIds = Object.keys(moduleData.data);
          nodeIds.forEach(nodeId => {
            try {
              // Используем стандартный метод removeNode вместо removeNodeFromData
              editor.removeNode(nodeId);
            } catch (e) {
              console.error('Error removing node:', e);
            }
          });
        }
      } else {
        console.log('✓ Preserving existing nodes (conditions, etc.) while adding build nodes...');
      }
      
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
            false
          );
        });
      }
    } catch (error) {
      console.error('Error loading build data:', error);
    }
  };

  // Helper function to get all nodes from editor - ПРАВИЛЬНОЕ ПОЛУЧЕНИЕ УЗЛОВ ИЗ МОДУЛЯ
  const getAllNodes = (editor) => {
    if (!editor || !editor.drawflow || !editor.module) return [];
    // Получаем узлы из текущего модуля
    const moduleData = editor.drawflow[editor.module];
    if (!moduleData || !moduleData.data) return [];
    return Object.values(moduleData.data);
  };

  const addConditionNode = () => {
    console.log('=== addConditionNode called ===');
    
    if (!editorRef.current) {
      console.error('ERROR: Editor not initialized yet!');
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
    
    // Находим свободное место по Y
    let newY = 50;
    const nodeHeight = 180;
    const occupiedYPositions = existingNodes
      .filter(n => n.pos_x >= maxX - 100)
      .map(n => n.pos_y)
      .sort((a, b) => a - b);
    
    for (let i = 0; i < occupiedYPositions.length; i++) {
      if (occupiedYPositions[i] > newY + nodeHeight) {
        break;
      }
      newY = occupiedYPositions[i] + nodeHeight + 20;
    }
    
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
    
    try {
      // ДОБАВЛЯЕМ НОДУ БЕЗ ПЕРЕРИСОВКИ REACT
      editor.addNode(
        'condition',
        1,
        1,
        maxX + 50,
        newY,
        'condition',
        { operator: '>', value: 0 },
        html,
        false
      );
      console.log('✓ Condition node added successfully. Total nodes:', Object.keys(editor.drawflow[editor.module]?.data || {}).length);
    } catch (error) {
      console.error('✗ ERROR adding condition node:', error);
    }
  };

  const addDayOfWeekNode = () => {
    console.log('=== addDayOfWeekNode called ===');
    
    if (!editorRef.current) {
      console.error('ERROR: Editor not initialized yet!');
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
    
    // Находим свободное место по Y
    let newY = 50;
    const nodeHeight = 180;
    const occupiedYPositions = existingNodes
      .filter(n => n.pos_x >= maxX - 100)
      .map(n => n.pos_y)
      .sort((a, b) => a - b);
    
    for (let i = 0; i < occupiedYPositions.length; i++) {
      if (occupiedYPositions[i] > newY + nodeHeight) {
        break;
      }
      newY = occupiedYPositions[i] + nodeHeight + 20;
    }
    
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
    
    try {
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
      console.log('✓ Day of Week node added successfully. Total nodes:', Object.keys(editor.drawflow[editor.module]?.data || {}).length);
    } catch (error) {
      console.error('✗ ERROR adding day of week node:', error);
    }
  };

  const addTimeNode = () => {
    console.log('=== addTimeNode called ===');
    
    if (!editorRef.current) {
      console.error('ERROR: Editor not initialized yet!');
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
    
    // Находим свободное место по Y
    let newY = 50;
    const nodeHeight = 180;
    const occupiedYPositions = existingNodes
      .filter(n => n.pos_x >= maxX - 100)
      .map(n => n.pos_y)
      .sort((a, b) => a - b);
    
    for (let i = 0; i < occupiedYPositions.length; i++) {
      if (occupiedYPositions[i] > newY + nodeHeight) {
        break;
      }
      newY = occupiedYPositions[i] + nodeHeight + 20;
    }
    
    const html = `
      <div class="drawflow_node_header bg-orange-500 text-white px-3 py-2 rounded-t-lg font-medium">
        🕐 Время
      </div>
      <div class="px-3 py-2 text-sm">
        <input type="time" class="w-full px-2 py-1 border rounded text-xs time-input" />
      </div>
    `;
    
    try {
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
      console.log('✓ Time node added successfully. Total nodes:', Object.keys(editor.drawflow[editor.module]?.data || {}).length);
    } catch (error) {
      console.error('✗ ERROR adding time node:', error);
    }
  };

  // Функция для добавления ноды данных (Trigger из post_fields)
  const addDataNode = () => {
    console.log('=== addDataNode called ===');
    
    if (!editorRef.current) {
      console.error('ERROR: Editor not initialized yet!');
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
    
    // Находим свободное место по Y
    let newY = 50;
    const nodeHeight = 180;
    const occupiedYPositions = existingNodes
      .filter(n => n.pos_x >= maxX - 100)
      .map(n => n.pos_y)
      .sort((a, b) => a - b);
    
    for (let i = 0; i < occupiedYPositions.length; i++) {
      if (occupiedYPositions[i] > newY + nodeHeight) {
        break;
      }
      newY = occupiedYPositions[i] + nodeHeight + 20;
    }
    
    // Получаем список доступных полей из выбранной сборки
    const selectedBuild = builds.find(b => b.id == buildId);
    const postFields = selectedBuild?.post_fields || [];
    
    const fieldOptions = postFields.map((field, index) => 
      `<option value="${field.field_name}">${field.name || field.field_name}</option>`
    ).join('');
    
    const html = `
      <div class="drawflow_node_header bg-blue-500 text-white px-3 py-2 rounded-t-lg font-medium">
        📡 Данные (POST)
      </div>
      <div class="px-3 py-2 text-sm">
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
      console.log('✓ Data node added successfully. Total nodes:', Object.keys(editor.drawflow[editor.module]?.data || {}).length);
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
    // Находим свободное место по Y, проверяя занятые позиции
    const occupiedYPositions = existingNodes
      .filter(n => n.pos_x >= maxX - 100) // Узлы в той же колонке
      .map(n => n.pos_y)
      .sort((a, b) => a - b);
    
    let newY = 50;
    const nodeHeight = 150; // Примерная высота узла
    for (let i = 0; i < occupiedYPositions.length; i++) {
      if (occupiedYPositions[i] > newY + nodeHeight) {
        // Нашли промежуток, можно разместить здесь
        break;
      }
      newY = occupiedYPositions[i] + nodeHeight + 20;
    }
    
    // Получаем список доступных полей из выбранной сборки
    const selectedBuild = builds.find(b => b.id == buildId);
    const getFields = selectedBuild?.get_fields || [];
    
    const fieldOptions = getFields.map((field, index) => 
      `<option value="${field.field_name}">${field.name || field.field_name}</option>`
    ).join('');
    
    const html = `
      <div class="drawflow_node_header bg-green-500 text-white px-3 py-2 rounded-t-lg font-medium">
        ⚙️ Действие (GET)
      </div>
      <div class="px-3 py-2 text-sm">
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
      // Убрали setFlowData - теперь не используем state для синхронизации
      setIsActive(scenario.is_active !== undefined ? scenario.is_active : true);
      setLoading(false);
      return parsedFlowData; // Возвращаем данные для импорта
    } catch (error) {
      console.error('Error fetching scenario:', error);
      setLoading(false);
      return null;
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
            className: 'drawflow-wrapper'
            // Убрали key, чтобы контейнер не пересоздавался при каждом рендере
          },
          React.createElement(
            'div',
            {
              ref: drawflowContainerRef,
              id: 'drawflow',
              className: '',
              style: {}
            }
          )
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
