console.log('Загрузка ScenarioEditor.jsx (fixed v3)');

if (!window.React || !window.axios) {
  console.error('ScenarioEditor.jsx: React или axios не загружены');
  throw new Error('React или axios не загружены');
}

const React = window.React;
const { useState, useEffect, useRef } = React;
const axios = window.axios;

function ScenarioEditorComponent({ scenarioId, onClose }) {
  console.log('ScenarioEditor.jsx: Рендеринг', { scenarioId });

  // State
  const [humanName, setHumanName] = useState('');
  const [machineName, setMachineName] = useState('');
  const [selectedBuildId, setSelectedBuildId] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [flowData, setFlowData] = useState(null);

  const [builds, setBuilds] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [hasSelectedBuild, setHasSelectedBuild] = useState(false);
  const [editorReady, setEditorReady] = useState(false);
  const [currentBuildData, setCurrentBuildData] = useState(null);

  const editorRef = useRef(null);
  const drawflowContainerRef = useRef(null);
  const nodesStateRef = useRef({});
  const isImportDone = useRef(false);

  // 1. Инициализация Drawflow
  useEffect(() => {
    let timer;

    const initDrawflow = () => {
      if (drawflowContainerRef.current && typeof window.Drawflow !== 'undefined' && !editorRef.current) {
        try {
          const editor = new window.Drawflow(drawflowContainerRef.current);
          editorRef.current = editor;

          editor.reroute = true;
          editor.reroute_fix_curvature = true;
          editor.force_first_input = false;
          editor.draggable_nodes = true;

          editor.start();
          setEditorReady(true);
          console.log('✓ Drawflow редактор успешно запущен!');
          console.log('Текущий модуль:', editor.module);

          // Обработчик nodeCreated
          editor.on('nodeCreated', (nodeId) => {
            const moduleData = editor.drawflow?.[editor.module];
            if (moduleData && moduleData.data[nodeId]) {
              nodesStateRef.current[nodeId] = JSON.parse(JSON.stringify(moduleData.data[nodeId]));
            }
            bindNodeEvents(nodeId, editor);
          });

          editor.on('nodeRemoved', (nodeId) => {
            delete nodesStateRef.current[nodeId];
          });

          editor.on('nodeMoved', (nodeId) => {
            const moduleData = editor.drawflow?.[editor.module];
            if (moduleData && moduleData.data[nodeId]) {
              nodesStateRef.current[nodeId] = JSON.parse(JSON.stringify(moduleData.data[nodeId]));
            }
          });

        } catch (error) {
          console.error('✗ ОШИБКА при инициализации Drawflow:', error);
        }
      } else {
        timer = setTimeout(initDrawflow, 100);
      }
    };

    initDrawflow();

    return () => {
      if (timer) clearTimeout(timer);
    };
  }, []);

  // 2. Загрузка данных сборки при выборе build_id
  useEffect(() => {
    if (editorReady && selectedBuildId && scenarioId && !window.currentBuildDataRef) {
      console.log('Загрузка данных сборки:', selectedBuildId);
      loadBuildDataForReference(selectedBuildId);
    }
  }, [editorReady, selectedBuildId, scenarioId]);

  // 3. Импорт flow_data, когда editor готов и flowData загружен, и есть данные сборки
  useEffect(() => {
    if (editorReady && flowData && !isImportDone.current && window.currentBuildDataRef) {
      console.log('=== ИМПОРТ FLOW_DATA ===');
      isImportDone.current = true;

      const editor = editorRef.current;
      if (!editor) {
        console.error('[ИМПОРТ] Редактор не доступен');
        return;
      }

      // Импортируем flow data
      editor.import(flowData);

      // Исправляем структуру: иногда import добавляет лишний уровень drawflow
      if (editor.drawflow && editor.drawflow.drawflow) {
        console.log('[ИМПОРТ] Обнаружена вложенная структура drawflow, извлекаем');
        editor.drawflow = editor.drawflow.drawflow;
      }

      console.log('✓ Flow data импортирован');
      console.log('[ИМПОРТ] editor.drawflow:', editor.drawflow);
      console.log('[ИМПОРТ] editor.drawflow.Home:', editor.drawflow?.['Home']);
      console.log('[ИМПОРТ] currentBuildDataRef:', window.currentBuildDataRef);
      console.log('[ИМПОРТ] build.get_fields:', window.currentBuildDataRef?.get_fields);

      const moduleData = editor.drawflow?.['Home'];
      if (moduleData && moduleData.data) {
        Object.keys(moduleData.data).forEach(nodeId => {
          nodesStateRef.current[nodeId] = JSON.parse(JSON.stringify(moduleData.data[nodeId]));
          // Сначала привязываем события
          bindNodeEvents(nodeId, editor);
          // Затем восстанавливаем состояние (с повторными попытками)
          restoreNodeState(nodeId, editor);
        });
        console.log('Сохранено узлов:', Object.keys(nodesStateRef.current).length);
      } else {
        console.error('[ИМПОРТ] Модуль Home или его data не найдены после импорта');
      }

      // Для диагностики
      setTimeout(() => {
        const nodesCount = Object.keys(editor.drawflow?.['Home']?.data || {}).length;
        console.log('Узлов в редакторе после импорта:', nodesCount);
      }, 500);
    }
  }, [editorReady, flowData, window.currentBuildDataRef]);

  // Восстановление состояния узла из сохранённых данных (с несколькими попытками)
  const restoreNodeState = (nodeId, editor, attempt = 0) => {
    const MAX_ATTEMPTS = 10;
    const nodeElement = document.querySelector(`[id^="node-${nodeId}"]`);
    
    if (!nodeElement && attempt < MAX_ATTEMPTS) {
      setTimeout(() => restoreNodeState(nodeId, editor, attempt + 1), 50);
      return;
    }
    
    if (!nodeElement) {
      console.warn(`Не удалось найти DOM-элемент для узла ${nodeId} после ${MAX_ATTEMPTS} попыток`);
      return;
    }

    const nodeData = editor.drawflow?.[editor.module]?.data?.[nodeId];
    if (!nodeData) {
      console.warn(`Нет данных для узла ${nodeId}`);
      return;
    }

    const selectedField = nodeData.data?.selected_field;
    const conditionType = nodeData.data?.condition_type || 'comparison';

    // Восстановление data node select
    const dataSelect = nodeElement.querySelector('.data-field-select');
    if (dataSelect && selectedField) {
      dataSelect.value = selectedField;
      console.log(`[Восстановление] Data node ${nodeId}: selected field = ${selectedField}`);
      dataSelect.dispatchEvent(new Event('change', { bubbles: true }));
    }

    // Восстановление action node select + параметры бота
    const actionSelect = nodeElement.querySelector('.action-field-select');
    if (actionSelect && selectedField) {
      actionSelect.value = selectedField;
      const botParameters = nodeData.data?.bot_parameters || {};
      renderBotParameters(nodeId, editor, selectedField, botParameters);
      console.log(`[Восстановление] Action node ${nodeId}: selected field = ${selectedField}`, botParameters);
      actionSelect.dispatchEvent(new Event('change', { bubbles: true }));
    }

    // Восстановление condition type + sections
    const conditionSelect = nodeElement.querySelector('.condition-type-select');
    if (conditionSelect) {
      const compSection = nodeElement.querySelector('.condition-comparison-section');
      const timeSection = nodeElement.querySelector('.condition-time-section');
      const daySection = nodeElement.querySelector('.condition-dayofweek-section');

      if (compSection && timeSection && daySection) {
        conditionSelect.value = conditionType;
        // Показываем нужную секцию
        compSection.style.display = (conditionType === 'comparison') ? 'block' : 'none';
        timeSection.style.display = (conditionType === 'time') ? 'block' : 'none';
        daySection.style.display = (conditionType === 'dayofweek') ? 'block' : 'none';
        conditionSelect.dispatchEvent(new Event('change', { bubbles: true }));
      }
      
      // Восстановление значений condition
      if (conditionType === 'comparison') {
        const operator = nodeData.data?.operator || '>';
        const value = nodeData.data?.value || 0;
        const operatorSelect = compSection?.querySelector('.condition-operator');
        const valueInput = compSection?.querySelector('.condition-value');
        if (operatorSelect) operatorSelect.value = operator;
        if (valueInput) valueInput.value = value;
      } else if (conditionType === 'time') {
        const time = nodeData.data?.time || '';
        const timeInput = timeSection?.querySelector('.time-input');
        if (timeInput) timeInput.value = time;
      } else if (conditionType === 'dayofweek') {
        const days = nodeData.data?.days || [];
        const dayCheckboxes = daySection?.querySelectorAll('.day-checkbox');
        dayCheckboxes?.forEach(cb => {
          const day = parseInt(cb.getAttribute('data-day'));
          cb.checked = days.includes(day);
        });
      }
      console.log(`[Восстановление] Condition node ${nodeId}: condition type = ${conditionType}`);
    }
  };


  // Единая функция отрисовки параметров бота для action node
  const renderBotParameters = (nodeId, editor, selectedField, botParameters = {}) => {
    const nodeElement = document.querySelector(`[id^="node-${nodeId}"]`);
    if (!nodeElement) return;

    const paramsContainer = nodeElement.querySelector('.bot-params-container');
    const paramsList = nodeElement.querySelector('.bot-params-list');

    if (!paramsContainer || !paramsList) return;

    // Получаем botParamsMap из текущей сборки
    const buildData = window.currentBuildDataRef;
    const getFields = buildData?.get_fields || [];
    const botParamsMap = {};
    getFields.forEach(field => {
      const machineName = field.machine_name || field.field_name;
      if (field.bot_parameters && Array.isArray(field.bot_parameters)) {
        botParamsMap[machineName] = field.bot_parameters;
      }
    });

    const params = botParamsMap[selectedField] || [];
    paramsList.innerHTML = '';

    if (params.length > 0) {
      params.forEach((param, idx) => {
        const paramHumanName = param.human_name || param.name || `Параметр ${idx + 1}`;
        const paramMachineName = param.machine_name || `param_${idx}`;
        const paramResult = param.result || '';
        const isChecked = botParameters[paramMachineName] !== undefined;

        const checkboxHTML = `<label class="flex items-center space-x-2 text-xs"><input type="checkbox" class="form-checkbox bot-param-check" data-param-name="${paramMachineName}" data-param-result="${paramResult}" ${isChecked ? 'checked' : ''} /><span>${paramHumanName}</span></label>`;
        paramsList.insertAdjacentHTML('beforeend', checkboxHTML);
      });
      paramsContainer.style.display = 'block';

      // Добавляем обработчики для чекбоксов
      paramsList.querySelectorAll('.bot-param-check').forEach(cb => {
        cb.addEventListener('change', (e) => {
          const paramName = e.target.getAttribute('data-param-name');
          const paramResult = e.target.getAttribute('data-param-result');
          const isChecked = e.target.checked;

          const moduleData = editor.drawflow?.[editor.module];
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

  const bindNodeEvents = (nodeId, editor) => {
    setTimeout(() => {
      const nodeElement = document.querySelector(`[id^="node-${nodeId}"]`);
      if (!nodeElement) return;

      // Data node select
      const dataSelect = nodeElement.querySelector('.data-field-select');
      if (dataSelect) {
        dataSelect.addEventListener('change', (e) => {
          const moduleData = editor.drawflow?.[editor.module];
          if (moduleData && moduleData.data[nodeId]) {
            moduleData.data[nodeId].data.selected_field = e.target.value;
            nodesStateRef.current[nodeId] = JSON.parse(JSON.stringify(moduleData.data[nodeId]));
          }
        });
      }

      // Action node select
      const actionSelect = nodeElement.querySelector('.action-field-select');
      if (actionSelect) {
        actionSelect.addEventListener('change', (e) => {
          const selectedValue = e.target.value.trim();
          const moduleData = editor.drawflow?.[editor.module];
          if (moduleData && moduleData.data[nodeId]) {
            moduleData.data[nodeId].data.selected_field = selectedValue;
            moduleData.data[nodeId].data.bot_parameters = moduleData.data[nodeId].data.bot_parameters || {};
            nodesStateRef.current[nodeId] = JSON.parse(JSON.stringify(moduleData.data[nodeId]));
            renderBotParameters(nodeId, editor, selectedValue, moduleData.data[nodeId].data.bot_parameters);
          }
        });
      }

      // Condition type + поля
      const conditionSelect = nodeElement.querySelector('.condition-type-select');
      if (conditionSelect) {
        const compSection = nodeElement.querySelector('.condition-comparison-section');
        const timeSection = nodeElement.querySelector('.condition-time-section');
        const daySection = nodeElement.querySelector('.condition-dayofweek-section');

        const updateConditionData = () => {
          const moduleData = editor.drawflow?.[editor.module];
          if (!moduleData?.data?.[nodeId]) return;
          const data = moduleData.data[nodeId].data;
          const type = conditionSelect.value;
          data.condition_type = type;

          if (type === 'comparison') {
            const opSelect = compSection?.querySelector('.condition-operator');
            const valInput = compSection?.querySelector('.condition-value');
            data.operator = opSelect?.value || '>';
            data.value = valInput?.value || 0;
          } else if (type === 'time') {
            const timeInput = timeSection?.querySelector('.time-input');
            data.time = timeInput?.value || '';
          } else if (type === 'dayofweek') {
            const checkboxes = daySection?.querySelectorAll('.day-checkbox');
            data.days = Array.from(checkboxes || [])
              .filter(cb => cb.checked)
              .map(cb => parseInt(cb.getAttribute('data-day')));
          }
          nodesStateRef.current[nodeId] = JSON.parse(JSON.stringify(moduleData.data[nodeId]));
        };

        // Изменение типа условия
        conditionSelect.addEventListener('change', () => {
          const type = conditionSelect.value;
          if (compSection) compSection.style.display = (type === 'comparison') ? 'block' : 'none';
          if (timeSection) timeSection.style.display = (type === 'time') ? 'block' : 'none';
          if (daySection) daySection.style.display = (type === 'dayofweek') ? 'block' : 'none';
          updateConditionData();
        });

        // Слушатели на все поля условия
        const addFieldListeners = (container, selector, eventType = 'change') => {
          if (!container) return;
          container.querySelectorAll(selector).forEach(el => {
            el.addEventListener(eventType, updateConditionData);
          });
        };

        addFieldListeners(compSection, '.condition-operator, .condition-value');
        addFieldListeners(timeSection, '.time-input');
        addFieldListeners(daySection, '.day-checkbox', 'change');

        // Первичное отображение и синхронизация
        if (conditionSelect.value) {
          conditionSelect.dispatchEvent(new Event('change', { bubbles: true }));
        }
      }
    }, 100);
  };

  const fetchBuilds = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get('/api/builds', {
        headers: { Authorization: `Bearer ${token}` }
      });
      setBuilds(response.data.builds || response.data || []);
    } catch (error) {
      console.error('Ошибка загрузки сборок:', error);
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
      setCurrentBuildData(build);
      console.log('✓ Данные сборки загружены:', build.human_name);
      setHasSelectedBuild(true);
      return build;                      // возвращаем для цепочки then
    } catch (error) {
      console.error('Ошибка загрузки данных сборки:', error);
    }
  };

  const getAllNodes = (editor) => {
    if (!editor || !editor.drawflow || !editor.module) return [];
    const mod = editor.module === 'Home' ? 'Home' : editor.module;
    const moduleData = editor.drawflow[mod];
    if (!moduleData || !moduleData.data) return [];
    return Object.values(moduleData.data);
  };

  // --- Добавление узлов остаётся без изменений, кроме удаления дублирующих обработчиков ---
  const addDataNode = () => {
    if (!editorRef.current) return;
    const editor = editorRef.current;
    editor.changeModule('Home');

    const existingNodes = getAllNodes(editor);
    const maxX = existingNodes.length > 0 ? Math.max(...existingNodes.map(n => n.pos_x)) : 300;
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
    const fieldOptions = postFields.map((f, i) => {
      const hName = f.human_name || f.name || f.field_name || `Поле ${i+1}`;
      const mName = f.machine_name || f.field_name || `field_${i}`;
      return `<option value="${mName}">${hName}</option>`;
    }).join('');

    const html = `
      <div class="drawflow_node_header bg-blue-500 text-white px-3 py-2 rounded-t-lg font-medium">📡 Данные (POST)</div>
      <div class="px-3 py-2 text-sm">
        <div class="mb-2">
          <label class="block text-xs text-gray-600 mb-1">Поле:</label>
          <select class="w-full px-2 py-1 border rounded text-xs data-field-select">
            <option value="">Выберите поле</option>
            ${fieldOptions}
          </select>
        </div>
      </div>`;
    try {
      editor.addNode('data', 1, 1, maxX + 50, newY, 'data', { field_name: '', type: 'post' }, html, false);
    } catch (error) {
      console.error('✗ Ошибка добавления узла данных:', error);
    }
  };

  const addActionNode = () => {
    if (!editorRef.current) return;
    const editor = editorRef.current;
    editor.changeModule('Home');

    const existingNodes = getAllNodes(editor);
    const maxX = existingNodes.length > 0 ? Math.max(...existingNodes.map(n => n.pos_x)) : 300;
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
    const botParamsMap = {};
    getFields.forEach(f => {
      const mName = f.machine_name || f.field_name;
      if (f.bot_parameters && Array.isArray(f.bot_parameters)) botParamsMap[mName] = f.bot_parameters;
    });
    const fieldOptions = getFields.map((f, i) => {
      const hName = f.human_name || f.name || f.field_name || `Команда ${i+1}`;
      const mName = f.machine_name || f.field_name || `cmd_${i}`;
      return `<option value="${mName}">${hName}</option>`;
    }).join('');

    const html = `
      <div class="drawflow_node_header bg-green-500 text-white px-3 py-2 rounded-t-lg font-medium">⚙️ Действие (GET)</div>
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
      </div>`;
    try {
      editor.addNode('action', 1, 0, maxX + 50, newY, 'action', { field_name: '', type: 'get', bot_parameters: {} }, html, false);
    } catch (error) {
      console.error('✗ Ошибка добавления узла действия:', error);
    }
  };

  const addConditionNode = () => {
    if (!editorRef.current) return;
    const editor = editorRef.current;
    editor.changeModule('Home');

    const existingNodes = getAllNodes(editor);
    const maxX = existingNodes.length > 0 ? Math.max(...existingNodes.map(n => n.pos_x)) : 300;
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

    const days = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
    const dayCheckboxes = days.map((day, index) => `
      <label class="flex items-center space-x-1 text-xs">
        <input type="checkbox" class="form-checkbox day-checkbox" data-day="${index}" />
        <span>${day}</span>
      </label>`).join('');

    const html = `
      <div class="drawflow_node_header bg-purple-600 text-white px-3 py-2 rounded-t-lg font-medium">🔀 Условие</div>
      <div class="px-3 py-2 text-sm">
        <div class="mb-3">
          <label class="block text-xs text-gray-600 mb-1">Тип условия:</label>
          <select class="w-full px-2 py-1 border rounded text-xs condition-type-select bg-white">
            <option value="comparison">Сравнение значений</option>
            <option value="time">Время</option>
            <option value="dayofweek">День недели</option>
          </select>
        </div>
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
        <div class="condition-time-section" style="display:none;">
          <div>
            <label class="block text-xs text-gray-600 mb-1">Время:</label>
            <input type="time" class="w-full px-2 py-1 border rounded text-xs time-input" />
          </div>
        </div>
        <div class="condition-dayofweek-section" style="display:none;">
          <label class="block text-xs text-gray-600 mb-2">Дни недели:</label>
          <div class="grid grid-cols-2 gap-1">${dayCheckboxes}</div>
        </div>
      </div>`;
    try {
      editor.addNode('condition', 1, 1, maxX + 50, newY, 'condition', {
        condition_type: 'comparison',
        operator: '>',
        value: 0,
        time: '',
        days: []
      }, html, false);
    } catch (error) {
      console.error('✗ Ошибка добавления узла условия:', error);
    }
  };

  // Сохранение
  const handleSave = async () => {
    if (!editorRef.current) return;
    setSaving(true);
    try {
      const token = localStorage.getItem('token');
      const exportedData = editorRef.current.export();

      if (!hasSelectedBuild) {
        alert('Пожалуйста, выберите сборку');
        setSaving(false);
        return;
      }

      const payload = {
        human_name: humanName,
        machine_name: machineName,
        build_id: parseInt(selectedBuildId),
        flow_data: JSON.stringify(exportedData),
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

      window.history.pushState({}, '', '/');
      window.dispatchEvent(new Event('popstate'));
    } catch (error) {
      console.error('Ошибка сохранения сценария:', error);
      alert('Ошибка при сохранении: ' + (error.response?.data?.detail || error.message));
    } finally {
      setSaving(false);
    }
  };

  // Загрузка сценария
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
      setSelectedBuildId(scenario.build_id || '');
      setIsActive(scenario.is_active !== undefined ? scenario.is_active : true);

      let parsedFlowData = null;
      if (typeof scenario.flow_data === 'string') {
        try {
          parsedFlowData = JSON.parse(scenario.flow_data);
        } catch (e) {
          console.error('Ошибка парсинга flow_data:', e);
          parsedFlowData = null;
        }
      } else {
        parsedFlowData = scenario.flow_data;
      }

      if (scenario.build_id) {
        // Загружаем сборку, потом устанавливаем flowData для импорта
        window.currentBuildDataRef = null;
        setCurrentBuildData(null);
        loadBuildDataForReference(scenario.build_id).then(() => {
          setFlowData(parsedFlowData);
          setHasSelectedBuild(true);
        });
      } else {
        setFlowData(parsedFlowData);
        setHasSelectedBuild(false);
      }

      setLoading(false);
    } catch (error) {
      console.error('Ошибка загрузки сценария:', error);
      setLoading(false);
    }
  };

  if (loading) {
    return React.createElement('div', { className: 'container mx-auto p-6' },
      React.createElement('div', { className: 'text-xl' }, 'Загрузка...')
    );
  }

  // JSX идентичен предыдущей версии, опущен для краткости (оставьте ваш текущий JSX)
  // ...
}

const ScenarioEditor = React.memo(ScenarioEditorComponent, (prev, next) => {
  return prev.scenarioId === next.scenarioId && prev.onClose === next.onClose;
});

window.ScenarioEditor = ScenarioEditor;
console.log('ScenarioEditor.jsx: Экспортирован', window.ScenarioEditor);