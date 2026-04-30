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

  // Используем refs для ВСЕХ значений, которые не требуют ре-рендера
  const humanNameRef = useRef('');
  const machineNameRef = useRef('');
  const buildIdRef = useRef('');
  const isActiveRef = useRef(true);

  // State только для тех полей, которые действительно нужны для UI
  const [builds, setBuilds] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [hasSelectedBuild, setHasSelectedBuild] = useState(false);

  const editorRef = useRef(null);
  const drawflowContainerRef = useRef(null);

  // ГЛАВНОЕ ХРАНИЛИЩЕ СОСТОЯНИЯ УЗЛОВ
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
          console.log('Creating new Drawflow instance...');
          const editor = new window.Drawflow(drawflowContainerRef.current);
          editorRef.current = editor;
          console.log('Drawflow instance created:', editor);

          // Базовые настройки
          console.log('Setting basic config...');
          editor.reroute = true;
          editor.reroute_fix_curvature = true;
          editor.force_first_input = false;
          editor.draggable_nodes = true;

          // КРИТИЧЕСКИ ВАЖНО: Создаем модуль ДО start()
          console.log('Creating default module BEFORE start...');
          editor.addModule('default', {});

          console.log('Calling editor.start()...');
          editor.start();

          // Переключаемся на модуль default
          editor.changeModule('default');
          console.log('Current module after change:', editor.module);

          // Обработчики событий
          editor.on('nodeCreated', (nodeId) => {
            console.log('✅ Node created:', nodeId);
            const moduleData = editor.drawflow[editor.module];
            if (moduleData && moduleData.data[nodeId]) {
              nodesStateRef.current[nodeId] = JSON.parse(JSON.stringify(moduleData.data[nodeId]));
              console.log('💾 Saved node state:', nodeId);
            }
            console.log('📊 Total nodes in storage:', Object.keys(nodesStateRef.current).length);

            // Добавляем обработчики для SELECT элементов
            setTimeout(() => {
              const nodeElement = document.querySelector(`[id^="node-${nodeId}"]`);
              if (nodeElement) {
                const dataSelect = nodeElement.querySelector('.data-field-select');
                const actionSelect = nodeElement.querySelector('.action-field-select');

                if (dataSelect) {
                  console.log('📡 Found data-field-select for node:', nodeId);
                  dataSelect.addEventListener('change', (e) => {
                    const selectedValue = e.target.value;
                    console.log('📡 Data field changed:', { machineName: selectedValue, nodeId });
                    const moduleData = editor.drawflow[editor.module];
                    if (moduleData && moduleData.data[nodeId]) {
                      moduleData.data[nodeId].data.selected_field = selectedValue;
                      nodesStateRef.current[nodeId] = JSON.parse(JSON.stringify(moduleData.data[nodeId]));
                    }
                  });
                }

                if (actionSelect) {
                  console.log('⚙️ Found action-field-select for node:', nodeId);
                  actionSelect.addEventListener('change', (e) => {
                    const selectedValue = e.target.value;
                    console.log('⚙️ Action field changed:', { machineName: selectedValue, nodeId });
                    const moduleData = editor.drawflow[editor.module];
                    if (moduleData && moduleData.data[nodeId]) {
                      moduleData.data[nodeId].data.selected_field = selectedValue;
                      nodesStateRef.current[nodeId] = JSON.parse(JSON.stringify(moduleData.data[nodeId]));
                    }
                  });
                }
              }
            }, 100);
          });

          editor.on('nodeRemoved', (nodeId) => {
            console.log('❌ Node removed:', nodeId);
            delete nodesStateRef.current[nodeId];
          });

          editor.on('nodeMoved', (nodeId) => {
            const moduleData = editor.drawflow[editor.module];
            if (moduleData && moduleData.data[nodeId]) {
              nodesStateRef.current[nodeId] = JSON.parse(JSON.stringify(moduleData.data[nodeId]));
            }
          });

          editor.on('connectionCreated', (connection) => {
            console.log('🔗 Connection created:', connection);
          });
          editor.on('connectionRemoved', (connection) => {
            console.log('✂️ Connection removed:', connection);
          });

          console.log('✓ Drawflow editor started successfully!');
          console.log('Editor state after start:', {
            hasNodes: editor.drawflow && editor.drawflow[editor.module] ? Object.keys(editor.drawflow[editor.module].data || {}).length > 0 : false,
            currentModule: editor.module
          });

        } catch (error) {
          console.error('✗ CRITICAL ERROR during Drawflow init:', error);
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

    return () => {
      console.log('Cleanup: clearing timer and stopping editor...');
      if (timer) clearTimeout(timer);
      console.log('Cleanup complete (preserving editor state)');
    };
  }, []);

  // Load build data ДЛЯ ВСЕХ сценариев при загрузке
  useEffect(() => {
    if (buildIdRef.current && editorRef.current) {
      console.log('Loading build data for reference...');
      loadBuildDataForReference(buildIdRef.current);
    }
  }, []);

  // Import flow data ONCE после инициализации редактора
  useEffect(() => {
    if (scenarioId && editorRef.current && !hasImportedFlowData.current) {
      console.log('=== LOAD SCENARIO DATA ===', { scenarioId, hasImportedFlowData: hasImportedFlowData.current });
      hasImportedFlowData.current = true;

      fetchScenario(scenarioId).then((scenarioData) => {
        if (scenarioData && editorRef.current) {
          const { parsedFlowData, build_id } = scenarioData;

          console.log('Fetched scenario data:', { build_id, hasFlowData: !!parsedFlowData });

          if (build_id) {
            buildIdRef.current = build_id.toString();
            setHasSelectedBuild(true);
            loadBuildDataForReference(build_id);
          }

          if (parsedFlowData) {
            console.log('Importing flow_data...');
            console.log('Flow data structure:', JSON.stringify(parsedFlowData).substring(0, 500));

            // УБЕДИМСЯ что мы в правильном модуле перед импортом
            const editor = editorRef.current;
            if (editor.drawflow.drawflow && editor.drawflow.drawflow['default']) {
              editor.changeModule('default');
              console.log('Switched to default module before import');
            }

            editor.import(parsedFlowData);
            console.log('✓ flowData imported successfully');

            // Сохраняем все импортированные узлы
            const moduleData = editor.drawflow[editor.module];
            if (moduleData && moduleData.data) {
              Object.keys(moduleData.data).forEach(nodeId => {
                nodesStateRef.current[nodeId] = JSON.parse(JSON.stringify(moduleData.data[nodeId]));
              });
              console.log('Saved imported nodes to state storage:', Object.keys(nodesStateRef.current).length, 'nodes');
            }

            // Проверка что узлы действительно добавлены
            setTimeout(() => {
              const nodesAfterImport = editor.drawflow[editor.module]?.data || {};
              console.log('Nodes after import:', Object.keys(nodesAfterImport).length);
              if (Object.keys(nodesAfterImport).length === 0) {
                console.error('⚠️ WARNING: No nodes found after import!');
                console.log('Available modules:', Object.keys(editor.drawflow.drawflow));
                console.log('Current module:', editor.module);
              }
            }, 200);
          } else {
            console.log('No flow_data to import');
          }
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

  const loadBuildDataForReference = async (id) => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get(`/api/builds/${id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const build = response.data.build || response.data;

      if (!build) return;

      window.currentBuildDataRef = build;
      console.log('✓ Build data loaded for reference:', build.human_name);
      console.log('Post fields:', build.post_fields?.length, 'Get fields:', build.get_fields?.length);

      setHasSelectedBuild(true);
    } catch (error) {
      console.error('Error loading build data:', error);
    }
  };

  const getAllNodes = (editor) => {
    if (!editor || !editor.drawflow || !editor.module) return [];
    const moduleData = editor.drawflow[editor.module];
    if (!moduleData || !moduleData.data) return [];
    return Object.values(moduleData.data);
  };

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

    const missingNodes = storedNodeIds.filter(id => !currentNodeIds.has(id));
    if (missingNodes.length > 0) {
      console.warn('⚠️ WARNING: Missing nodes:', missingNodes);
    }
  };

  const addDataNode = () => {
    console.log('=== addDataNode called ===');
    restoreNodesFromState();

    if (!editorRef.current) {
      console.error('ERROR: Editor not initialized!');
      return;
    }

    const editor = editorRef.current;

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

    const existingNodes = getAllNodes(editor);
    const maxX = existingNodes && existingNodes.length > 0
      ? Math.max(...existingNodes.map(n => n.pos_x))
      : 300;

    let newY = 50;
    const nodeHeight = 180;
    const occupiedYPositions = existingNodes
      .filter(n => n.pos_x >= maxX - 100)
      .map(n => n.pos_y)
      .sort((a, b) => a - b);

    for (let i = 0; i < occupiedYPositions.length; i++) {
      if (occupiedYPositions[i] > newY + nodeHeight) break;
      newY = occupiedYPositions[i] + nodeHeight + 20;
    }

    const buildData = window.currentBuildDataRef;
    const postFields = buildData?.post_fields || [];

    console.log('📡 Data node - Available post fields:', postFields);

    const fieldOptions = postFields.map((field, index) => {
      const humanName = field.human_name || field.name || field.field_name || `Field ${index + 1}`;
      const machineName = field.machine_name || field.field_name || `field_${index}`;
      return `<option value="${machineName}">${humanName}</option>`;
    }).join('');

    const html = `
      <div class="drawflow_node_header bg-blue-500 text-white px-3 py-2 rounded-t-lg font-medium">
        📡 Data (POST)
      </div>
      <div class="px-3 py-2 text-sm">
        <div class="mb-2">
          <label class="block text-xs text-gray-600 mb-1">Field:</label>
          <select class="w-full px-2 py-1 border rounded text-xs data-field-select">
            <option value="">Choose field</option>
            ${fieldOptions}
          </select>
        </div>
      </div>
    `;

    try {
      editor.addNode(
        'data',
        1, 1,
        maxX + 50, newY,
        'data',
        { field_name: '', type: 'post' },
        html,
        false
      );
      console.log('✓ Data node added. Total:', Object.keys(editor.drawflow[editor.module]?.data || {}).length);
    } catch (error) {
      console.error('✗ ERROR adding data node:', error);
    }
  };

  const addActionNode = () => {
    console.log('=== addActionNode called ===');
    restoreNodesFromState();

    if (!editorRef.current) {
      console.error('ERROR: Editor not initialized!');
      return;
    }

    const editor = editorRef.current;

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

    const existingNodes = getAllNodes(editor);
    const maxX = existingNodes && existingNodes.length > 0
      ? Math.max(...existingNodes.map(n => n.pos_x))
      : 300;

    let newY = 50;
    const nodeHeight = 150;
    const occupiedYPositions = existingNodes
      .filter(n => n.pos_x >= maxX - 100)
      .map(n => n.pos_y)
      .sort((a, b) => a - b);

    for (let i = 0; i < occupiedYPositions.length; i++) {
      if (occupiedYPositions[i] > newY + nodeHeight) break;
      newY = occupiedYPositions[i] + nodeHeight + 20;
    }

    const buildData = window.currentBuildDataRef;
    const getFields = buildData?.get_fields || [];

    console.log('⚙️ Action node - Available get fields:', getFields);

    const botParamsMap = {};
    getFields.forEach(field => {
      const machineName = field.machine_name || field.field_name;
      if (field.bot_parameters && Array.isArray(field.bot_parameters)) {
        botParamsMap[machineName] = field.bot_parameters;
      }
    });

    const fieldOptions = getFields.map((field, index) => {
      const humanName = field.human_name || field.name || field.field_name || `Command ${index + 1}`;
      const machineName = field.machine_name || field.field_name || `cmd_${index}`;
      return `<option value="${machineName}" data-has-params="${!!field.bot_parameters}">${humanName}</option>`;
    }).join('');

    const html = `
      <div class="drawflow_node_header bg-green-500 text-white px-3 py-2 rounded-t-lg font-medium">
        ⚙️ Action (GET)
      </div>
      <div class="px-3 py-2 text-sm">
        <div class="mb-2">
          <label class="block text-xs text-gray-600 mb-1">Command:</label>
          <select class="w-full px-2 py-1 border rounded text-xs action-field-select">
            <option value="">Choose command</option>
            ${fieldOptions}
          </select>
        </div>
        <div class="bot-params-container mt-2 pt-2 border-t" style="display:none;">
          <label class="block text-xs text-gray-600 mb-1">Parameters:</label>
          <div class="bot-params-list space-y-1"></div>
        </div>
      </div>
    `;

    try {
      const nodeId = editor.addNode(
        'action',
        1, 0,
        maxX + 50, newY,
        'action',
        { field_name: '', type: 'get', bot_parameters: {} },
        html,
        false
      );
      console.log('✓ Action node added with ID:', nodeId);

      setTimeout(() => {
        const nodeElement = document.querySelector(`[id^="node-${nodeId}"]`);
        if (nodeElement) {
          const actionSelect = nodeElement.querySelector('.action-field-select');
          const paramsContainer = nodeElement.querySelector('.bot-params-container');
          const paramsList = nodeElement.querySelector('.bot-params-list');

          if (actionSelect && paramsContainer && paramsList) {
            const updateParams = () => {
              const selectedValue = actionSelect.value;
              console.log('⚙️ Action selected:', selectedValue);

              const moduleData = editor.drawflow[editor.module];
              if (moduleData && moduleData.data[nodeId]) {
                moduleData.data[nodeId].data.selected_field = selectedValue;
                nodesStateRef.current[nodeId] = JSON.parse(JSON.stringify(moduleData.data[nodeId]));
              }

              paramsList.innerHTML = '';

              if (selectedValue && botParamsMap[selectedValue]) {
                const params = botParamsMap[selectedValue];
                console.log('⚙️ Showing parameters for', selectedValue);

                params.forEach((param, idx) => {
                  const paramHumanName = param.human_name || param.name || `Param ${idx + 1}`;
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

                const checkboxes = paramsList.querySelectorAll('.bot-param-check');
                checkboxes.forEach(cb => {
                  cb.addEventListener('change', (e) => {
                    const paramName = e.target.getAttribute('data-param-name');
                    const paramResult = e.target.getAttribute('data-param-result');
                    const isChecked = e.target.checked;

                    const moduleData = editor.drawflow[editor.module];
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
              }
            };

            actionSelect.addEventListener('change', updateParams);
          }
        }
      }, 100);
    } catch (error) {
      console.error('✗ ERROR adding action node:', error);
    }
  };

  const addConditionNode = () => {
    console.log('=== addConditionNode called ===');
    restoreNodesFromState();

    if (!editorRef.current) {
      console.error('ERROR: Editor not initialized!');
      return;
    }

    const editor = editorRef.current;

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

    const existingNodes = getAllNodes(editor);
    const maxX = existingNodes && existingNodes.length > 0
      ? Math.max(...existingNodes.map(n => n.pos_x))
      : 300;

    let newY = 50;
    const nodeHeight = 220;
    const occupiedYPositions = existingNodes
      .filter(n => n.pos_x >= maxX - 100)
      .map(n => n.pos_y)
      .sort((a, b) => a - b);

    for (let i = 0; i < occupiedYPositions.length; i++) {
      if (occupiedYPositions[i] > newY + nodeHeight) break;
      newY = occupiedYPositions[i] + nodeHeight + 20;
    }

    const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    const dayCheckboxes = days.map((day, index) => `
      <label class="flex items-center space-x-1 text-xs">
        <input type="checkbox" class="form-checkbox day-checkbox" data-day="${index}" />
        <span>${day}</span>
      </label>
    `).join('');

    const html = `
      <div class="drawflow_node_header bg-purple-600 text-white px-3 py-2 rounded-t-lg font-medium">
        🔀 Condition
      </div>
      <div class="px-3 py-2 text-sm">
        <div class="mb-3">
          <label class="block text-xs text-gray-600 mb-1">Condition type:</label>
          <select class="w-full px-2 py-1 border rounded text-xs condition-type-select bg-white">
            <option value="comparison">Comparison</option>
            <option value="time">Time</option>
            <option value="dayofweek">Day of week</option>
          </select>
        </div>

        <div class="condition-comparison-section">
          <div class="mb-2">
            <label class="block text-xs text-gray-600 mb-1">Operator:</label>
            <select class="w-full px-2 py-1 border rounded text-xs condition-operator">
              <option value=">">> (greater)</option>
              <option value="<">< (less)</option>
              <option value="==">== (equal)</option>
              <option value="!=">!= (not equal)</option>
              <option value=">=">>= (greater or equal)</option>
              <option value="<="><= (less or equal)</option>
            </select>
          </div>
          <div>
            <label class="block text-xs text-gray-600 mb-1">Value:</label>
            <input type="number" class="w-full px-2 py-1 border rounded text-xs condition-value" placeholder="Enter value" />
          </div>
        </div>

        <div class="condition-time-section" style="display:none;">
          <div>
            <label class="block text-xs text-gray-600 mb-1">Time:</label>
            <input type="time" class="w-full px-2 py-1 border rounded text-xs time-input" />
          </div>
        </div>

        <div class="condition-dayofweek-section" style="display:none;">
          <label class="block text-xs text-gray-600 mb-2">Days:</label>
          <div class="grid grid-cols-2 gap-1">
            ${dayCheckboxes}
          </div>
        </div>
      </div>
    `;

    try {
      editor.addNode(
        'condition',
        1, 1,
        maxX + 50, newY,
        'condition',
        { type: 'comparison', operator: '>', value: 0, time: '', days: [] },
        html,
        false
      );

      console.log('✓ Condition node added. Total:', Object.keys(editor.drawflow[editor.module]?.data || {}).length);

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
              comparisonSection.style.display = 'none';
              timeSection.style.display = 'none';
              dayOfWeekSection.style.display = 'none';

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

  const handleSave = async () => {
    if (!editorRef.current) return;

    setSaving(true);
    try {
      const token = localStorage.getItem('token');
      const exportedData = editorRef.current.export();

      if (!hasSelectedBuild) {
        alert('Please select a build');
        setSaving(false);
        return;
      }

      const payload = {
        human_name: humanNameRef.current,
        machine_name: machineNameRef.current,
        build_id: parseInt(buildIdRef.current),
        flow_data: JSON.stringify(exportedData),
        is_active: isActiveRef.current
      };

      console.log('Saving scenario:', payload);

      if (scenarioId) {
        await axios.put(`/api/scenarios/${scenarioId}`, payload, {
          headers: { Authorization: `Bearer ${token}` }
        });
      } else {
        await axios.post('/api/scenarios', payload, {
          headers: { Authorization: `Bearer ${token}` }
        });
      }

      window.history.pushState({}, '', '/');
      window.dispatchEvent(new Event('popstate'));
    } catch (error) {
      console.error('Error saving scenario:', error);
      alert('Error saving: ' + (error.response?.data?.detail || error.message));
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

      humanNameRef.current = scenario.human_name || '';
      machineNameRef.current = scenario.machine_name || '';
      buildIdRef.current = scenario.build_id || '';
      isActiveRef.current = scenario.is_active !== undefined ? scenario.is_active : true;

      if (scenario.build_id) {
        setHasSelectedBuild(true);
      }

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
      React.createElement('div', { className: 'text-xl' }, 'Loading...')
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
        scenarioId ? 'Edit Scenario' : 'Create Scenario'
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
            'Name'
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
            'Machine name'
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
            'Build'
          ),
          React.createElement(
            'select',
            {
              id: 'build_id',
              value: buildIdRef.current,
              onChange: (e) => {
                const selectedValue = e.target.value;
                buildIdRef.current = selectedValue;
                setHasSelectedBuild(!!selectedValue);
                if (selectedValue) {
                  loadBuildDataForReference(selectedValue);
                } else {
                  setHasSelectedBuild(false);
                }
              },
              className: 'w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500',
              required: true
            },
            React.createElement('option', { value: '' }, 'Select build'),
            builds.map(build =>
              React.createElement('option', { key: build.id, value: build.id }, build.human_name)
            )
          )
        ),
        React.createElement(
          'div',
          { className: 'mb-6' },
          React.createElement(
            'div',
            { className: 'flex items-center justify-between mb-2' },
            React.createElement(
              'h3',
              { className: 'text-lg font-semibold text-gray-800' },
              'Visual Editor'
            ),
            React.createElement(
              'div',
              { className: 'flex space-x-2' },
              React.createElement(
                'button',
                {
                  type: 'button',
                  onClick: () => addDataNode(),
                  disabled: !hasSelectedBuild,
                  className: `px-3 py-1 bg-blue-500 text-white text-sm rounded hover:bg-blue-600 focus:outline-none ${!hasSelectedBuild ? 'opacity-50 cursor-not-allowed' : ''}`
                },
                '+ Data'
              ),
              React.createElement(
                'button',
                {
                  type: 'button',
                  onClick: () => addActionNode(),
                  disabled: !hasSelectedBuild,
                  className: `px-3 py-1 bg-green-500 text-white text-sm rounded hover:bg-green-600 focus:outline-none ${!hasSelectedBuild ? 'opacity-50 cursor-not-allowed' : ''}`
                },
                '+ Action'
              ),
              React.createElement(
                'button',
                {
                  type: 'button',
                  onClick: () => addConditionNode(),
                  disabled: !hasSelectedBuild,
                  className: `px-3 py-1 bg-purple-600 text-white text-sm rounded hover:bg-purple-700 focus:outline-none ${!hasSelectedBuild ? 'opacity-50 cursor-not-allowed' : ''}`
                },
                '+ Condition'
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
              'Globally enabled'
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
                window.history.pushState({}, '', '/');
                window.dispatchEvent(new Event('popstate'));
              },
              className: 'px-4 py-2 text-gray-700 bg-gray-200 rounded hover:bg-gray-300 focus:outline-none'
            },
            'Cancel'
          ),
          React.createElement(
            'button',
            {
              type: 'button',
              onClick: handleSave,
              disabled: saving,
              className: 'px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-50'
            },
            saving ? 'Saving...' : 'Save'
          )
        )
      )
    )
  );
}

const ScenarioEditor = React.memo(ScenarioEditorComponent, (prevProps, nextProps) => {
  return prevProps.scenarioId === nextProps.scenarioId && prevProps.onClose === nextProps.onClose;
});

window.ScenarioEditor = ScenarioEditor;
console.log('ScenarioEditor.jsx: ScenarioEditor exported:', window.ScenarioEditor);
