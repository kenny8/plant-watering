console.log('Loading ScenarioEditor.jsx...');

if (!window.React || !window.axios) {
  console.error('ScenarioEditor.jsx: React or axios not loaded');
  throw new Error('React or axios not loaded');
}

const React = window.React;
const { useState, useEffect, useRef, useMemo, useCallback } = React;
const axios = window.axios;

// Оборачиваем компонент в React.memo для предотвращения ре-рендеров
function ScenarioEditorComponent({ scenarioId, onClose }) {
  console.log('ScenarioEditor.jsx: Rendering', { scenarioId });
  
  // Используем refs вместо state для ВСЕХ значений, которые не требуют ре-рендера
  const humanNameRef = useRef('');
  const machineNameRef = useRef('');
  const buildIdRef = useRef('');
  const isActiveRef = useRef(true);
  
  // State только для тех полей, которые действительно нужны для UI
  const [builds, setBuilds] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [hasSelectedBuild, setHasSelectedBuild] = useState(false); // Отслеживаем выбор сборки в реальном времени
  
  const editorRef = useRef(null);
  const drawflowContainerRef = useRef(null);
  
  // ГЛАВНОЕ ХРАНИЛИЩЕ СОСТОЯНИЯ УЗЛОВ
  // Сохраняем полную копию всех узлов, чтобы восстанавливать их при ререндерах React
  const nodesStateRef = useRef({}); 
  
  const hasImportedFlowData = useRef(false);
  const isInitialized = useRef(false);

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
          
          // Добавляем обработчики событий для отладки и СОХРАНЕНИЯ состояния
          editor.on('nodeCreated', (nodeId) => {
            console.log('✅ Node created:', nodeId);
            // Сохраняем состояние узла в нашем хранилище
            const moduleData = editor.drawflow[editor.module];
            if (moduleData && moduleData.data[nodeId]) {
              nodesStateRef.current[nodeId] = JSON.parse(JSON.stringify(moduleData.data[nodeId]));
              console.log('💾 Saved node state:', nodeId, nodesStateRef.current[nodeId]);
            }
            console.log('📊 Total nodes in storage:', Object.keys(nodesStateRef.current).length);
            
            // ДОБАВЛЯЕМ ОБРАБОТЧИКИ ДЛЯ SELECT ЭЛЕМЕНТОВ В НОДАХ
            setupNodeSelectHandlers(nodeId);
          });
          
          // Обработчик для импортированных узлов - срабатывает после import()
          editor.on('import', (data) => {
            console.log('📥 Import event triggered', data);
            const moduleData = editor.drawflow[editor.module];
            if (moduleData && moduleData.data) {
              Object.keys(moduleData.data).forEach(nodeId => {
                nodesStateRef.current[nodeId] = JSON.parse(JSON.stringify(moduleData.data[nodeId]));
                console.log('💾 Saved imported node via event:', nodeId);
                setupNodeSelectHandlers(nodeId);
              });
              console.log('✅ Total nodes in storage after import:', Object.keys(nodesStateRef.current).length);
            }
          });
          
          editor.on('nodeRemoved', (nodeId) => {
            console.log('❌ Node removed:', nodeId);
            // Удаляем из хранилища
            delete nodesStateRef.current[nodeId];
            console.log('🗑️ Node removed from state storage. Remaining nodes:', Object.keys(nodesStateRef.current));
          });
          
          editor.on('nodeMoved', (nodeId) => {
            // Обновляем позицию в хранилище
            const moduleData = editor.drawflow[editor.module];
            if (moduleData && moduleData.data[nodeId]) {
              nodesStateRef.current[nodeId] = JSON.parse(JSON.stringify(moduleData.data[nodeId]));
            }
          });
          
          editor.on('connectionCreated', (connection) => {
            console.log('🔗 Connection created:', connection);
          });
          editor.on('connectionRemoved', (connection) => {
            console.log('✂️  Connection removed:', connection);
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

  // Load build data ONLY for reference (DO NOT create nodes automatically)
  useEffect(() => {
    if (buildIdRef.current && editorRef.current) {
      console.log('BuildId changed, loading build data for reference ONLY (NOT creating nodes)...');
      // Загружаем данные сборки только для справки (чтобы кнопки "+ Данные" и "+ Действия" знали какие поля доступны)
      loadBuildDataForReference(buildIdRef.current);
    }
  }, []); // Убрали зависимость buildId - используем ref

  // Import flow data ONLY ONCE during initial editor setup - ИМПОРТИРУЕМ ТОЛЬКО ОДИН РАЗ
  useEffect(() => {
    if (scenarioId && editorRef.current && !hasImportedFlowData.current && !isInitialized.current) {
      // Загружаем данные сценария и импортируем flow_data
      isInitialized.current = true;
      hasImportedFlowData.current = true;
      fetchScenario(scenarioId).then((scenarioData) => {
        if (scenarioData && editorRef.current) {
          const { parsedFlowData, build_id } = scenarioData;
          
          // Устанавливаем build_id из сохраненного сценария
          if (build_id) {
            buildIdRef.current = build_id.toString();
            // Загружаем данные сборки для справки
            loadBuildDataForReference(build_id);
          }
          
          if (parsedFlowData) {
            console.log('📥 Importing flowData (only on initial load)...', parsedFlowData);
            
            // Проверяем, есть ли данные для импорта
            const hasDataToImport = parsedFlowData.drawflow && 
              (parsedFlowData.drawflow.Home?.data || parsedFlowData.drawflow.default?.data);
            
            if (hasDataToImport) {
              // Сначала переключаемся на модуль, где есть данные
              const moduleWithData = parsedFlowData.drawflow.default?.data ? 'default' : 'Home';
              editorRef.current.changeModule(moduleWithData);
              
              // Импортируем данные - обработчик editor.on('import') автоматически сохранит узлы
              editorRef.current.import(parsedFlowData);
              
              console.log('✓ flowData import initiated - nodes will be saved via import event handler');
            } else {
              console.log('ℹ️ No flow data to import (empty scenario)');
            }
          }
        }
      });
    }
  }, []); // Убрали зависимость scenarioId - работает только один раз

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

  // Load build data ONLY for reference (store in ref for buttons to use)
  const loadBuildDataForReference = async (id) => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get(`/api/builds/${id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const build = response.data.build || response.data;
      
      if (!build) return;

      // Store build data in a ref for buttons to access when creating nodes
      window.currentBuildDataRef = build;
      console.log('✓ Build data loaded for reference:', build.human_name);
      console.log('Post fields:', build.post_fields?.length, 'Get fields:', build.get_fields?.length);
      
      // Обновляем состояние для разблокировки UI после загрузки данных сборки
      setHasSelectedBuild(true);
    } catch (error) {
      console.error('Error loading build data for reference:', error);
    }
  };

  // OLD FUNCTION - kept for compatibility but NOT used automatically anymore
  const loadBuildAndCreateNodes = async (id, clearExisting = false) => {
    console.log('⚠️ loadBuildAndCreateNodes is deprecated - use loadBuildDataForReference instead');
  };

  // Helper function to get all nodes from editor - ПРАВИЛЬНОЕ ПОЛУЧЕНИЕ УЗЛОВ ИЗ МОДУЛЯ
  const getAllNodes = (editor) => {
    if (!editor || !editor.drawflow || !editor.module) return [];
    // Получаем узлы из текущего модуля
    const moduleData = editor.drawflow[editor.module];
    if (!moduleData || !moduleData.data) return [];
    return Object.values(moduleData.data);
  };
  
  // Функция восстановления узлов из хранилища состояния (на случай потери)
  const restoreNodesFromState = () => {
    const editor = editorRef.current;
    if (!editor || !nodesStateRef.current) return;
    
    const currentNodes = getAllNodes(editor);
    const currentNodeIds = new Set(currentNodes.map(n => n.id.toString()));
    const storedNodeIds = Object.keys(nodesStateRef.current);
    
    console.log('Checking for missing nodes...', {
      current: currentNodeIds.size,
      stored: storedNodeIds.length
    });
    
    // Находим отсутствующие узлы
    const missingNodes = storedNodeIds.filter(id => !currentNodeIds.has(id));
    
    if (missingNodes.length > 0) {
      console.warn('⚠️ WARNING: Nodes are missing from editor, attempting to restore...', missingNodes);
      
      // Восстанавливаем каждый отсутствующий узел через import
      try {
        const module = editor.module;
        if (!editor.drawflow[module]) {
          editor.drawflow[module] = { data: {} };
        }
        
        // Создаем структуру для импорта
        const importData = {
          drawflow: {
            [module]: {
              data: {}
            }
          }
        };
        
        // Добавляем все отсутствующие узлы в структуру импорта
        missingNodes.forEach(nodeId => {
          const nodeData = nodesStateRef.current[nodeId];
          if (nodeData) {
            importData.drawflow[module].data[nodeId] = nodeData;
            console.log('🔄 Preparing to restore node:', nodeId);
          }
        });
        
        // Импортируем узлы - Drawflow сам добавит их на канвас
        editor.import(importData);
        
        console.log('✅ Restoration complete. Total nodes now:', Object.keys(nodesStateRef.current).length);
        
      } catch (error) {
        console.error('❌ Failed to restore nodes:', error);
      }
    } else {
      console.log('✓ All nodes are present in editor');
    }
  };
  
  // Helper function to setup select handlers for a node
  const setupNodeSelectHandlers = (nodeId) => {
    setTimeout(() => {
      const nodeElement = document.querySelector(`[id^="node-${nodeId}"]`);
      if (!nodeElement) {
        console.log('⚠️ Node element not found for node:', nodeId);
        return;
      }
      
      const editor = editorRef.current;
      if (!editor) {
        console.log('⚠️ Editor not ready for node:', nodeId);
        return;
      }
      
      const moduleData = editor.drawflow[editor.module];
      const dataSelect = nodeElement.querySelector('.data-field-select');
      const actionSelect = nodeElement.querySelector('.action-field-select');
      
      if (dataSelect) {
        console.log('📡 Found data-field-select for node:', nodeId);
        // Проверяем, есть ли уже обработчик (чтобы не дублировать)
        if (!dataSelect.hasAttribute('data-handler-bound')) {
          dataSelect.setAttribute('data-handler-bound', 'true');
          dataSelect.addEventListener('change', (e) => {
            const selectedValue = e.target.value;
            const selectedOption = e.target.options[e.target.selectedIndex];
            console.log('📡 Data field changed:', { 
              machineName: selectedValue, 
              humanName: selectedOption.text,
              nodeId: nodeId 
            });
            // Сохраняем выбранное значение в данные узла
            if (moduleData && moduleData.data[nodeId]) {
              moduleData.data[nodeId].data.selected_field = selectedValue;
              nodesStateRef.current[nodeId] = JSON.parse(JSON.stringify(moduleData.data[nodeId]));
            }
          });
        }
      }
      
      if (actionSelect) {
        console.log('⚙️ Found action-field-select for node:', nodeId);
        // Проверяем, есть ли уже обработчик (чтобы не дублировать)
        if (!actionSelect.hasAttribute('data-handler-bound')) {
          actionSelect.setAttribute('data-handler-bound', 'true');
          actionSelect.addEventListener('change', (e) => {
            const selectedValue = e.target.value;
            const selectedOption = e.target.options[e.target.selectedIndex];
            console.log('⚙️ Action field changed:', { 
              machineName: selectedValue, 
              humanName: selectedOption.text,
              nodeId: nodeId 
            });
            // Сохраняем выбранное значение в данные узла
            if (moduleData && moduleData.data[nodeId]) {
              moduleData.data[nodeId].data.selected_field = selectedValue;
              nodesStateRef.current[nodeId] = JSON.parse(JSON.stringify(moduleData.data[nodeId]));
            }
          });
        }
      }
    }, 100);
  };

  const addConditionNode = () => {
    console.log('=== addConditionNode called ===');
    
    // ПРОВЕРЯЕМ что узлы на месте перед добавлением нового
    restoreNodesFromState();
    
    if (!editorRef.current) {
      console.error('ERROR: Editor not initialized yet!');
      return;
    }
    
    const editor = editorRef.current;
    
    // Безопасная проверка: создаем модуль 'default' только если его реально нет в данных
    if (!editor.module) {
      try {
        if (!editor.drawflow.drawflow['default']) {
          editor.addModule('default', {});
        }
        editor.changeModule('default');
      } catch (moduleError) {
        console.error('Failed to switch module:', moduleError);
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
    const nodeHeight = 220;
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
    const dayCheckboxes = days.map((day, index) => `
      <label class="flex items-center space-x-1 text-xs">
        <input type="checkbox" class="form-checkbox day-checkbox" data-day="${index}" />
        <span>${day}</span>
      </label>
    `).join('');
    
    const html = `
      <div class="drawflow_node_header bg-purple-600 text-white px-3 py-2 rounded-t-lg font-medium">
        🔀 Условие
      </div>
      <div class="px-3 py-2 text-sm">
        <div class="mb-3">
          <label class="block text-xs text-gray-600 mb-1">Тип условия:</label>
          <select class="w-full px-2 py-1 border rounded text-xs condition-type-select bg-white">
            <option value="comparison">Сравнение значений</option>
            <option value="time">Время</option>
            <option value="dayofweek">День недели</option>
          </select>
        </div>
        
        <!-- Секция сравнения -->
        <div class="condition-comparison-section">
          <div class="mb-2">
            <label class="block text-xs text-gray-600 mb-1">Оператор:</label>
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
            <label class="block text-xs text-gray-600 mb-1">Значение:</label>
            <input type="number" class="w-full px-2 py-1 border rounded text-xs condition-value" placeholder="Введите значение" />
          </div>
        </div>
        
        <!-- Секция времени -->
        <div class="condition-time-section" style="display:none;">
          <div>
            <label class="block text-xs text-gray-600 mb-1">Время:</label>
            <input type="time" class="w-full px-2 py-1 border rounded text-xs time-input" />
          </div>
        </div>
        
        <!-- Секция дней недели -->
        <div class="condition-dayofweek-section" style="display:none;">
          <label class="block text-xs text-gray-600 mb-2">Дни недели:</label>
          <div class="grid grid-cols-2 gap-1">
            ${dayCheckboxes}
          </div>
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
        { type: 'comparison', operator: '>', value: 0, time: '', days: [] },
        html,
        false
      );
      
      console.log('✓ Condition node added successfully. Total nodes:', Object.keys(editor.drawflow[editor.module]?.data || {}).length);
      
      // Добавляем обработчик переключения типа условия
      setTimeout(() => {
        const allNodes = document.querySelectorAll('[id^="node-"]');
        let targetNodeElement = null;
        allNodes.forEach(node => {
          if (node.querySelector('.condition-type-select')) {
            targetNodeElement = node;
          }
        });
        
        if (targetNodeElement) {
          const typeSelect = targetNodeElement.querySelector('.condition-type-select');
          const comparisonSection = targetNodeElement.querySelector('.condition-comparison-section');
          const timeSection = targetNodeElement.querySelector('.condition-time-section');
          const dayOfWeekSection = targetNodeElement.querySelector('.condition-dayofweek-section');
          
          if (typeSelect && comparisonSection && timeSection && dayOfWeekSection) {
            typeSelect.addEventListener('change', (e) => {
              const selectedType = e.target.value;
              
              // Скрываем все секции
              comparisonSection.style.display = 'none';
              timeSection.style.display = 'none';
              dayOfWeekSection.style.display = 'none';
              
              // Показываем нужную секцию
              if (selectedType === 'comparison') {
                comparisonSection.style.display = 'block';
              } else if (selectedType === 'time') {
                timeSection.style.display = 'block';
              } else if (selectedType === 'dayofweek') {
                dayOfWeekSection.style.display = 'block';
              }
              
              console.log('🔄 Condition type changed to:', selectedType);
            });
          }
        }
      }, 100);
      
    } catch (error) {
      console.error('✗ ERROR adding condition node:', error);
    }
  };

  // Функции addDayOfWeekNode и addTimeNode удалены - теперь они встроены в addConditionNode

  // Функция для добавления ноды данных (Trigger из post_fields)
  const addDataNode = () => {
    console.log('=== addDataNode called ===');
    
    // ПРОВЕРЯЕМ что узлы на месте перед добавлением нового
    restoreNodesFromState();
    
    if (!editorRef.current) {
      console.error('ERROR: Editor not initialized yet!');
      return;
    }
    
    const editor = editorRef.current;
    
    // Безопасная проверка: создаем модуль 'default' только если его реально нет в данных
    if (!editor.module) {
      try {
        if (!editor.drawflow.drawflow['default']) {
          editor.addModule('default', {});
        }
        editor.changeModule('default');
      } catch (moduleError) {
        console.error('Failed to switch module:', moduleError);
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
    // Используем window.currentBuildDataRef который загружается при выборе сборки
    const buildData = window.currentBuildDataRef;
    const postFields = buildData?.post_fields || [];
    
    console.log('📡 Data node - Available post fields:', postFields);
    
    const fieldOptions = postFields.map((field, index) => {
      const humanName = field.human_name || field.name || field.field_name || `Поле ${index + 1}`;
      const machineName = field.machine_name || field.field_name || `field_${index}`;
      return `<option value="${machineName}">${humanName}</option>`;
    }).join('');
    
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
    
    // ПРОВЕРЯЕМ что узлы на месте перед добавлением нового
    restoreNodesFromState();
    
    if (!editorRef.current) {
      console.error('ERROR: Editor not initialized yet! editorRef.current is null');
      return;
    }
    
    const editor = editorRef.current;
    
    // Безопасная проверка: создаем модуль 'default' только если его реально нет в данных
    if (!editor.module) {
      try {
        if (!editor.drawflow.drawflow['default']) {
          editor.addModule('default', {});
        }
        editor.changeModule('default');
      } catch (moduleError) {
        console.error('Failed to switch module:', moduleError);
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
    // Используем window.currentBuildDataRef который загружается при выборе сборки
    const buildData = window.currentBuildDataRef;
    const getFields = buildData?.get_fields || [];
    
    console.log('⚙️ Action node - Available get fields:', getFields);
    
    // Создаем мапу bot_parameters по machine_name для быстрого доступа
    const botParamsMap = {};
    getFields.forEach(field => {
      const machineName = field.machine_name || field.field_name;
      if (field.bot_parameters && Array.isArray(field.bot_parameters)) {
        botParamsMap[machineName] = field.bot_parameters;
        console.log(`📦 Bot parameters for ${machineName}:`, field.bot_parameters);
      }
    });
    
    const fieldOptions = getFields.map((field, index) => {
      const humanName = field.human_name || field.name || field.field_name || `Команда ${index + 1}`;
      const machineName = field.machine_name || field.field_name || `cmd_${index}`;
      return `<option value="${machineName}" data-has-params="${!!field.bot_parameters}">${humanName}</option>`;
    }).join('');
    
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
        <div class="bot-params-container mt-2 pt-2 border-t" style="display:none;">
          <label class="block text-xs text-gray-600 mb-1">Параметры:</label>
          <div class="bot-params-list space-y-1"></div>
        </div>
      </div>
    `;
    
    try {
      const nodeId = editor.addNode(
        'action',
        1,
        0,
        maxX + 50,
        newY,
        'action',
        { field_name: '', type: 'get', bot_parameters: {} },
        html,
        false
      );
      console.log('✓ Action node added successfully with ID:', nodeId);
      
      // Добавляем обработчик изменения select для динамического отображения параметров
      setTimeout(() => {
        const nodeElement = document.querySelector(`[id^="node-${nodeId}"]`);
        if (nodeElement) {
          const actionSelect = nodeElement.querySelector('.action-field-select');
          const paramsContainer = nodeElement.querySelector('.bot-params-container');
          const paramsList = nodeElement.querySelector('.bot-params-list');
          
          if (actionSelect && paramsContainer && paramsList) {
            console.log('⚙️ Setting up action select handler for node:', nodeId);
            
            const updateParams = () => {
              const selectedValue = actionSelect.value;
              console.log('⚙️ Action selected:', selectedValue);
              
              // Сохраняем выбранное значение в данные узла
              const moduleData = editor.drawflow[editor.module];
              if (moduleData && moduleData.data[nodeId]) {
                moduleData.data[nodeId].data.selected_field = selectedValue;
                nodesStateRef.current[nodeId] = JSON.parse(JSON.stringify(moduleData.data[nodeId]));
              }
              
              // Очищаем предыдущие параметры
              paramsList.innerHTML = '';
              
              // Показываем/скрываем контейнер параметров
              if (selectedValue && botParamsMap[selectedValue]) {
                const params = botParamsMap[selectedValue];
                console.log('⚙️ Showing parameters for', selectedValue, ':', params);
                
                params.forEach((param, idx) => {
                  const paramHumanName = param.human_name || param.name || `Параметр ${idx + 1}`;
                  const paramMachineName = param.machine_name || `param_${idx}`;
                  const paramResult = param.result || '';
                  
                  const paramHtml = `
                    <label class="flex items-center space-x-2 text-xs">
                      <input type="checkbox" class="form-checkbox bot-param-check" 
                             data-param-name="${paramMachineName}" 
                             data-param-result="${paramResult}" />
                      <span>${paramHumanName}</span>
                      <span class="text-xs text-gray-400">(${paramMachineName})</span>
                    </label>
                  `;
                  paramsList.insertAdjacentHTML('beforeend', paramHtml);
                });
                
                paramsContainer.style.display = 'block';
                
                // Добавляем обработчики изменений для чекбоксов параметров
                const checkboxes = paramsList.querySelectorAll('.bot-param-check');
                checkboxes.forEach(cb => {
                  cb.addEventListener('change', (e) => {
                    const paramName = e.target.getAttribute('data-param-name');
                    const paramResult = e.target.getAttribute('data-param-result');
                    const isChecked = e.target.checked;
                    console.log('⚙️ Parameter changed:', { paramName, paramResult, isChecked, nodeId });
                    
                    // Обновляем bot_parameters в данных узла
                    if (moduleData && moduleData.data[nodeId]) {
                      const currentParams = moduleData.data[nodeId].data.bot_parameters || {};
                      if (isChecked) {
                        currentParams[paramName] = paramResult;
                      } else {
                        delete currentParams[paramName];
                      }
                      moduleData.data[nodeId].data.bot_parameters = currentParams;
                      nodesStateRef.current[nodeId] = JSON.parse(JSON.stringify(moduleData.data[nodeId]));
                    }
                  });
                });
              } else {
                paramsContainer.style.display = 'none';
                console.log('⚙️ No parameters for this action or no action selected');
              }
            };
            
            actionSelect.addEventListener('change', updateParams);
            
            // Вызываем один раз при инициализации (на случай если значение уже выбрано)
            // updateParams();
          }
        }
      }, 100);
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
      
      // Проверка hasSelectedBuild перед отправкой (проверяем по состоянию, а не по ref)
      if (!hasSelectedBuild) {
        alert('Пожалуйста, выберите сборку');
        setSaving(false);
        return;
      }
      
      const payload = { 
        human_name: humanNameRef.current, 
        machine_name: machineNameRef.current, 
        build_id: parseInt(buildIdRef.current),
        // Сериализуем flow_data в JSON строку для бэкенда
        flow_data: JSON.stringify(exportedData),
        is_active: isActiveRef.current
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
      // Используем refs вместо setHumanName, setMachineName и т.д.
      humanNameRef.current = scenario.human_name || '';
      machineNameRef.current = scenario.machine_name || '';
      buildIdRef.current = scenario.build_id || '';
      isActiveRef.current = scenario.is_active !== undefined ? scenario.is_active : true;
      
      // Если есть build_id, сразу устанавливаем hasSelectedBuild для разблокировки UI
      if (scenario.build_id) {
        setHasSelectedBuild(true);
      } else {
        setHasSelectedBuild(false);
      }
      
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
      setLoading(false);
      // Возвращаем объект с данными для импорта
      return { parsedFlowData, build_id: scenario.build_id };
    } catch (error) {
      console.error('Error fetching scenario:', error);
      setLoading(false);
      return { parsedFlowData: null, build_id: null };
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
              defaultValue: humanNameRef.current,
              onChange: (e) => { humanNameRef.current = e.target.value; },
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
              defaultValue: machineNameRef.current,
              onChange: (e) => { machineNameRef.current = e.target.value; },
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
              value: buildIdRef.current,
              onChange: (e) => { 
                const selectedValue = e.target.value;
                buildIdRef.current = selectedValue;
                // Обновляем состояние для мгновенной разблокировки UI
                setHasSelectedBuild(!!selectedValue);
                // Загружаем данные сборки для справки (чтобы кнопки знали какие поля доступны)
                if (selectedValue) {
                  loadBuildDataForReference(selectedValue);
                } else {
                  setHasSelectedBuild(false);
                }
              },
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
      // Drawflow Editor Section - disabled until build is selected
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
                disabled: !hasSelectedBuild,
                className: `px-3 py-1 bg-blue-500 text-white text-sm rounded hover:bg-blue-600 focus:outline-none ${!hasSelectedBuild ? 'opacity-50 cursor-not-allowed' : ''}`
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
                disabled: !hasSelectedBuild,
                className: `px-3 py-1 bg-green-500 text-white text-sm rounded hover:bg-green-600 focus:outline-none ${!hasSelectedBuild ? 'opacity-50 cursor-not-allowed' : ''}`
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
                disabled: !hasSelectedBuild,
                className: `px-3 py-1 bg-purple-600 text-white text-sm rounded hover:bg-purple-700 focus:outline-none ${!hasSelectedBuild ? 'opacity-50 cursor-not-allowed' : ''}`
              },
              '+ Условие'
            )
          )
        ),
        React.createElement(
          'div',
          {
            className: `drawflow-wrapper ${!hasSelectedBuild ? 'pointer-events-none opacity-50' : ''}`
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
              defaultChecked: isActiveRef.current,
              onChange: (e) => { isActiveRef.current = e.target.checked; }
            }),
            React.createElement(
              'div',
              {
                className: `block w-14 h-8 rounded-full transition-colors ${isActiveRef.current ? 'bg-green-600' : 'bg-gray-300'}`
              }
            ),
            React.createElement(
              'div',
              {
                className: `absolute left-1 top-1 bg-white w-6 h-6 rounded-full transition-transform ${isActiveRef.current ? 'translate-x-6' : ''}`
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

// Оборачиваем компонент в React.memo для предотвращения ре-рендеров при изменении props
// Важно: используем кастомное сравнение props, чтобы избежать лишних ререндеров
const ScenarioEditor = React.memo(ScenarioEditorComponent, (prevProps, nextProps) => {
  // Сравниваем props и возвращаем true, если они эквивалентны (чтобы предотвратить ререндер)
  return prevProps.scenarioId === nextProps.scenarioId && prevProps.onClose === nextProps.onClose;
});

window.ScenarioEditor = ScenarioEditor;
console.log('ScenarioEditor.jsx: ScenarioEditor exported:', window.ScenarioEditor);
