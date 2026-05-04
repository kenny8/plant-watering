console.log('Загрузка ScenarioEditor.jsx (fixed v5 + logic node + data no input)');

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

  // Вспомогательная функция для доступа к данным drawflow (учитываем возможную вложенность)
  const getDrawflowData = (editor) => {
    if (!editor || !editor.drawflow) return null;
    return editor.drawflow.drawflow || editor.drawflow;
  };

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

          editor.on('nodeCreated', (nodeId) => {
            const drawflowData = getDrawflowData(editor);
            const mod = editor.module;
            const moduleData = drawflowData ? drawflowData[mod] : null;
            if (moduleData && moduleData.data[nodeId]) {
              nodesStateRef.current[nodeId] = JSON.parse(JSON.stringify(moduleData.data[nodeId]));
            }
            bindNodeEvents(nodeId, editor);
          });

          editor.on('nodeRemoved', (nodeId) => {
            delete nodesStateRef.current[nodeId];
          });

          editor.on('nodeMoved', (nodeId) => {
            const drawflowData = getDrawflowData(editor);
            const mod = editor.module;
            const moduleData = drawflowData ? drawflowData[mod] : null;
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

  // 2. Импорт flow_data
  useEffect(() => {
    if (editorReady && flowData && !isImportDone.current && window.currentBuildDataRef) {
      console.log('=== ИМПОРТ FLOW_DATA ===');
      isImportDone.current = true;

      const editor = editorRef.current;
      if (!editor) {
        console.error('[ИМПОРТ] Редактор не доступен');
        return;
      }

      let importData = flowData;
      if (!importData.drawflow) {
        if (importData.Home) {
          console.warn('[ИМПОРТ] flowData не содержит обёртку drawflow, оборачиваем');
          importData = { drawflow: { Home: importData.Home } };
        } else {
          console.error('[ИМПОРТ] Некорректный формат flowData, импорт невозможен', importData);
          return;
        }
      }

      try {
        editor.import(importData);

        console.log('✓ Flow data импортирован');
        console.log('[ИМПОРТ] editor.drawflow:', editor.drawflow);
        const drawflowData = getDrawflowData(editor);
        console.log('[ИМПОРТ] drawflowData:', drawflowData);
        console.log('[ИМПОРТ] drawflowData.Home:', drawflowData ? drawflowData['Home'] : undefined);
        console.log('[ИМПОРТ] currentBuildDataRef:', window.currentBuildDataRef);
        console.log('[ИМПОРТ] build.get_fields:', window.currentBuildDataRef?.get_fields);

        const moduleData = drawflowData ? drawflowData['Home'] : null;
        if (moduleData && moduleData.data) {
          Object.keys(moduleData.data).forEach(nodeId => {
            nodesStateRef.current[nodeId] = JSON.parse(JSON.stringify(moduleData.data[nodeId]));
            bindNodeEvents(nodeId, editor);
            restoreNodeState(nodeId, editor);
          });
          console.log('Сохранено узлов:', Object.keys(nodesStateRef.current).length);
        } else {
          console.error('[ИМПОРТ] Модуль Home или его data не найдены после импорта');
        }

        setTimeout(() => {
          const dfData = getDrawflowData(editor);
          const nodesCount = Object.keys(dfData?.['Home']?.data || {}).length;
          console.log('Узлов в редакторе после импорта:', nodesCount);
        }, 500);
      } catch (error) {
        console.error('[ИМПОРТ] Ошибка импорта flow_data:', error);
        alert('Не удалось загрузить визуальный редактор. Возможно, данные повреждены.');
      }
    }
  }, [editorReady, flowData, window.currentBuildDataRef]);

  // Восстановление состояния узла
  const restoreNodeState = (nodeId, editor, attempt = 0) => {
    const MAX_ATTEMPTS = 10;
    const nodeElement = document.querySelector(`[id^="node-${nodeId}"]`);
    
    if (!nodeElement && attempt < MAX_ATTEMPTS) {
      setTimeout(() => restoreNodeState(nodeId, editor, attempt + 1), 50);
      return;
    }
    
    if (!nodeElement) {
      console.warn(`Не удалось найти DOM-элемент для узла ${nodeId}`);
      return;
    }

    const drawflowData = getDrawflowData(editor);
    const mod = editor.module;
    const nodeData = drawflowData?.[mod]?.data?.[nodeId];
    if (!nodeData) {
      console.warn(`Нет данных для узла ${nodeId}`);
      return;
    }

    const data = nodeData.data || {};
    const selectedField = data.selected_field;
    const conditionType = data.type || 'comparison';
    const logicType = data.logic_type || 'and';

    // Data node select
    const dataSelect = nodeElement.querySelector('.data-field-select');
    if (dataSelect && selectedField) {
      dataSelect.value = selectedField;
      data.selected_field = selectedField;
      dataSelect.dispatchEvent(new Event('change', { bubbles: true }));
      console.log(`[Восстановление] Data node ${nodeId}: selected field = ${selectedField}`);
    }

    // Action node select + bot parameters
    const actionSelect = nodeElement.querySelector('.action-field-select');
    if (actionSelect && selectedField) {
      actionSelect.value = selectedField;
      data.selected_field = selectedField;
      const botParameters = data.bot_parameters || {};
      renderBotParameters(nodeId, editor, selectedField, botParameters);
      console.log(`[Восстановление] Action node ${nodeId}: selected field = ${selectedField}`, botParameters);
      actionSelect.dispatchEvent(new Event('change', { bubbles: true }));
    }

    // Condition node
    const conditionSelect = nodeElement.querySelector('.condition-type-select');
    if (conditionSelect) {
      const compSection = nodeElement.querySelector('.condition-comparison-section');
      const timeSection = nodeElement.querySelector('.condition-time-section');
      const daySection = nodeElement.querySelector('.condition-dayofweek-section');

      if (compSection && timeSection && daySection) {
        conditionSelect.value = conditionType;
        data.type = conditionType;
        conditionSelect.dispatchEvent(new Event('change', { bubbles: true }));
        
        compSection.style.display = 'none';
        timeSection.style.display = 'none';
        daySection.style.display = 'none';

        if (conditionType === 'comparison') {
          compSection.style.display = 'block';
          const operatorSelect = compSection.querySelector('.condition-operator');
          const valueInput = compSection.querySelector('.condition-value');
          if (operatorSelect) {
            operatorSelect.value = data.operator || '>';
            data.operator = operatorSelect.value;
          }
          if (valueInput) {
            valueInput.value = data.value || 0;
            data.value = valueInput.value;
          }
        } else if (conditionType === 'time') {
          timeSection.style.display = 'block';
          const timeInput = timeSection.querySelector('.time-input');
          if (timeInput) {
            timeInput.value = data.time || '';
            data.time = timeInput.value;
          }
        } else if (conditionType === 'dayofweek') {
          daySection.style.display = 'block';
          const days = data.days || [];
          const dayCheckboxes = daySection.querySelectorAll('.day-checkbox');
          dayCheckboxes.forEach(cb => {
            const day = parseInt(cb.getAttribute('data-day'));
            cb.checked = days.includes(day);
          });
          data.days = Array.from(dayCheckboxes)
                         .filter(cb => cb.checked)
                         .map(cb => parseInt(cb.getAttribute('data-day')));
        }
        console.log(`[Восстановление] Condition node ${nodeId}: condition type = ${conditionType}`);
      }
    }

    // Logic node
    const logicSelect = nodeElement.querySelector('.logic-type-select');
    if (logicSelect) {
      logicSelect.value = logicType;
      data.logic_type = logicType;
      logicSelect.dispatchEvent(new Event('change', { bubbles: true }));
      console.log(`[Восстановление] Logic node ${nodeId}: logic type = ${logicType}`);
    }
  };

  // Отрисовка параметров бота (без изменений)
  const renderBotParameters = (nodeId, editor, selectedField, botParameters = {}) => {
    console.log('[renderBotParameters] Called with:', { nodeId, selectedField, botParameters });
    const nodeElement = document.querySelector(`[id^="node-${nodeId}"]`);
    if (!nodeElement) return;

    const paramsContainer = nodeElement.querySelector('.bot-params-container');
    const paramsList = nodeElement.querySelector('.bot-params-list');
    if (!paramsContainer || !paramsList) return;

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

      const checkboxes = paramsList.querySelectorAll('.bot-param-check');
      checkboxes.forEach(cb => {
        cb.addEventListener('change', (e) => {
          const clicked = e.target;
          const paramName = clicked.getAttribute('data-param-name');
          const paramResult = clicked.getAttribute('data-param-result');

          if (clicked.checked) {
            checkboxes.forEach(other => { if (other !== clicked) other.checked = false; });
          }

          const drawflowData = getDrawflowData(editor);
          const mod = editor.module;
          const moduleData = drawflowData?.[mod];
          if (moduleData && moduleData.data[nodeId]) {
            const currentParams = {};
            if (clicked.checked) {
              currentParams[paramName] = paramResult;
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
          const selectedValue = e.target.value;
          const drawflowData = getDrawflowData(editor);
          const mod = editor.module;
          const moduleData = drawflowData?.[mod];
          if (moduleData && moduleData.data[nodeId]) {
            moduleData.data[nodeId].data.selected_field = selectedValue;
            nodesStateRef.current[nodeId] = JSON.parse(JSON.stringify(moduleData.data[nodeId]));
          }
        });
      }

      // Action node select
      const actionSelect = nodeElement.querySelector('.action-field-select');
      if (actionSelect) {
        actionSelect.addEventListener('change', (e) => {
          const selectedValue = e.target.value.trim();
          const drawflowData = getDrawflowData(editor);
          const mod = editor.module;
          const moduleData = drawflowData?.[mod];
          if (moduleData && moduleData.data[nodeId]) {
            moduleData.data[nodeId].data.selected_field = selectedValue;
            moduleData.data[nodeId].data.bot_parameters = {};
            nodesStateRef.current[nodeId] = JSON.parse(JSON.stringify(moduleData.data[nodeId]));
            renderBotParameters(nodeId, editor, selectedValue, {});
          }
        });
      }

      // Condition type select
      const conditionSelect = nodeElement.querySelector('.condition-type-select');
      if (conditionSelect) {
        const compSection = nodeElement.querySelector('.condition-comparison-section');
        const timeSection = nodeElement.querySelector('.condition-time-section');
        const daySection = nodeElement.querySelector('.condition-dayofweek-section');

        if (compSection && timeSection && daySection) {
          conditionSelect.addEventListener('change', (e) => {
            const type = e.target.value;
            compSection.style.display = 'none';
            timeSection.style.display = 'none';
            daySection.style.display = 'none';

            if (type === 'comparison') compSection.style.display = 'block';
            else if (type === 'time') timeSection.style.display = 'block';
            else if (type === 'dayofweek') daySection.style.display = 'block';

            const drawflowData = getDrawflowData(editor);
            const mod = editor.module;
            const moduleData = drawflowData?.[mod];
            if (moduleData && moduleData.data[nodeId]) {
              moduleData.data[nodeId].data.type = type;
              nodesStateRef.current[nodeId] = JSON.parse(JSON.stringify(moduleData.data[nodeId]));
            }
          });
        }

        // Дополнительные поля условия
        const operatorSelect = compSection?.querySelector('.condition-operator');
        const valueInput = compSection?.querySelector('.condition-value');
        const timeInput = timeSection?.querySelector('.time-input');
        const dayCheckboxes = daySection?.querySelectorAll('.day-checkbox');

        const updateConditionData = () => {
          const drawflowData = getDrawflowData(editor);
          const mod = editor.module;
          const moduleData = drawflowData?.[mod];
          if (!moduleData || !moduleData.data[nodeId]) return;
          const data = moduleData.data[nodeId].data;
          const type = data.type || 'comparison';
          if (type === 'comparison') {
            data.operator = operatorSelect?.value || '>';
            data.value = valueInput?.value || 0;
          } else if (type === 'time') {
            data.time = timeInput?.value || '';
          } else if (type === 'dayofweek') {
            data.days = Array.from(dayCheckboxes)
                              .filter(cb => cb.checked)
                              .map(cb => parseInt(cb.getAttribute('data-day')));
          }
          nodesStateRef.current[nodeId] = JSON.parse(JSON.stringify(moduleData.data[nodeId]));
        };

        if (operatorSelect) operatorSelect.addEventListener('change', updateConditionData);
        if (valueInput) valueInput.addEventListener('input', updateConditionData);
        if (timeInput) timeInput.addEventListener('change', updateConditionData);
        if (dayCheckboxes.length > 0) {
          dayCheckboxes.forEach(cb => cb.addEventListener('change', updateConditionData));
        }
      }

      // Logic type select
      const logicSelect = nodeElement.querySelector('.logic-type-select');
      if (logicSelect) {
        logicSelect.addEventListener('change', (e) => {
          const type = e.target.value;
          const drawflowData = getDrawflowData(editor);
          const mod = editor.module;
          const moduleData = drawflowData?.[mod];
          if (moduleData && moduleData.data[nodeId]) {
            moduleData.data[nodeId].data.logic_type = type;
            nodesStateRef.current[nodeId] = JSON.parse(JSON.stringify(moduleData.data[nodeId]));
          }
        });
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
    } catch (error) {
      console.error('Ошибка загрузки данных сборки:', error);
      throw error;
    }
  };

  const getAllNodes = (editor) => {
    const drawflowData = getDrawflowData(editor);
    if (!drawflowData || !editor.module) return [];
    const mod = editor.module;
    const moduleData = drawflowData[mod];
    if (!moduleData || !moduleData.data) return [];
    return Object.values(moduleData.data);
  };

  const ensureHomeModule = (editor) => {
    if (editor.module !== 'Home') {
      editor.changeModule('Home');
    }
  };

  const addDataNode = () => {
    if (!editorRef.current) return;
    const editor = editorRef.current;
    ensureHomeModule(editor);

    const existingNodes = getAllNodes(editor);
    const maxX = existingNodes.length > 0
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
      // 0 inputs, 1 output
      editor.addNode('data', 0, 1, maxX + 50, newY, 'data', { field_name: '', type: 'post' }, html, false);
      console.log('✓ Узел данных добавлен');
    } catch (error) {
      console.error('✗ Ошибка добавления узла данных:', error);
    }
  };

  const addActionNode = () => {
    if (!editorRef.current) return;
    const editor = editorRef.current;
    ensureHomeModule(editor);

    const existingNodes = getAllNodes(editor);
    const maxX = existingNodes.length > 0
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

    const botParamsMap = {};
    getFields.forEach(field => {
      const machineName = field.machine_name || field.field_name;
      if (field.bot_parameters && Array.isArray(field.bot_parameters)) {
        botParamsMap[machineName] = field.bot_parameters;
      }
    });

    const fieldOptions = getFields.map((field, index) => {
      const humanName = field.human_name || field.name || field.field_name || `Команда ${index + 1}`;
      const machineName = field.machine_name || field.field_name || `cmd_${index}`;
      return `<option value="${machineName}">${humanName}</option>`;
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
      const nodeId = editor.addNode('action', 1, 0, maxX + 50, newY, 'action', { field_name: '', type: 'get', bot_parameters: {} }, html, false);

      setTimeout(() => {
        const nodeElement = document.querySelector(`[id^="node-${nodeId}"]`);
        if (nodeElement) {
          const actionSelect = nodeElement.querySelector('.action-field-select');
          const paramsContainer = nodeElement.querySelector('.bot-params-container');
          const paramsList = nodeElement.querySelector('.bot-params-list');

          if (actionSelect && paramsContainer && paramsList) {
            const updateParams = () => {
              const selectedValue = actionSelect.value;
              const drawflowData = getDrawflowData(editor);
              const mod = editor.module;
              const moduleData = drawflowData?.[mod];
              if (moduleData && moduleData.data[nodeId]) {
                moduleData.data[nodeId].data.selected_field = selectedValue;
                moduleData.data[nodeId].data.bot_parameters = {};
                nodesStateRef.current[nodeId] = JSON.parse(JSON.stringify(moduleData.data[nodeId]));
              }
              renderBotParameters(nodeId, editor, selectedValue, {});
            };

            actionSelect.addEventListener('change', updateParams);
          }
        }
      }, 100);
    } catch (error) {
      console.error('✗ Ошибка добавления узла действия:', error);
    }
  };

  const addConditionNode = () => {
    if (!editorRef.current) return;
    const editor = editorRef.current;
    ensureHomeModule(editor);

    const existingNodes = getAllNodes(editor);
    const maxX = existingNodes.length > 0
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
          <div class="grid grid-cols-2 gap-1">
            ${dayCheckboxes}
          </div>
        </div>
      </div>
    `;

    try {
      const nodeId = editor.addNode('condition', 1, 1, maxX + 50, newY, 'condition', { type: 'comparison', operator: '>', value: 0, time: '', days: [] }, html, false);

      setTimeout(() => {
        const nodeElement = document.querySelector(`[id^="node-${nodeId}"]`);
        if (nodeElement) {
          const typeSelect = nodeElement.querySelector('.condition-type-select');
          const compSection = nodeElement.querySelector('.condition-comparison-section');
          const timeSection = nodeElement.querySelector('.condition-time-section');
          const daySection = nodeElement.querySelector('.condition-dayofweek-section');

          if (typeSelect && compSection && timeSection && daySection) {
            typeSelect.addEventListener('change', (e) => {
              const type = e.target.value;
              compSection.style.display = 'none';
              timeSection.style.display = 'none';
              daySection.style.display = 'none';
              if (type === 'comparison') compSection.style.display = 'block';
              else if (type === 'time') timeSection.style.display = 'block';
              else if (type === 'dayofweek') daySection.style.display = 'block';

              const drawflowData = getDrawflowData(editor);
              const mod = editor.module;
              const moduleData = drawflowData?.[mod];
              if (moduleData && moduleData.data[nodeId]) {
                moduleData.data[nodeId].data.type = type;
                nodesStateRef.current[nodeId] = JSON.parse(JSON.stringify(moduleData.data[nodeId]));
              }
            });
          }

          const operatorSelect = compSection?.querySelector('.condition-operator');
          const valueInput = compSection?.querySelector('.condition-value');
          const timeInput = timeSection?.querySelector('.time-input');
          const dayCheckboxes = daySection?.querySelectorAll('.day-checkbox');

          const updateConditionData = () => {
            const drawflowData = getDrawflowData(editor);
            const mod = editor.module;
            const moduleData = drawflowData?.[mod];
            if (!moduleData || !moduleData.data[nodeId]) return;
            const data = moduleData.data[nodeId].data;
            const type = data.type || 'comparison';
            if (type === 'comparison') {
              data.operator = operatorSelect?.value || '>';
              data.value = valueInput?.value || 0;
            } else if (type === 'time') {
              data.time = timeInput?.value || '';
            } else if (type === 'dayofweek') {
              data.days = Array.from(dayCheckboxes)
                                .filter(cb => cb.checked)
                                .map(cb => parseInt(cb.getAttribute('data-day')));
            }
            nodesStateRef.current[nodeId] = JSON.parse(JSON.stringify(moduleData.data[nodeId]));
          };

          if (operatorSelect) operatorSelect.addEventListener('change', updateConditionData);
          if (valueInput) valueInput.addEventListener('input', updateConditionData);
          if (timeInput) timeInput.addEventListener('change', updateConditionData);
          if (dayCheckboxes.length > 0) {
            dayCheckboxes.forEach(cb => cb.addEventListener('change', updateConditionData));
          }
        }
      }, 100);
    } catch (error) {
      console.error('✗ Ошибка добавления узла условия:', error);
    }
  };

  const addLogicNode = () => {
    if (!editorRef.current) return;
    const editor = editorRef.current;
    ensureHomeModule(editor);

    const existingNodes = getAllNodes(editor);
    const maxX = existingNodes.length > 0
      ? Math.max(...existingNodes.map(n => n.pos_x))
      : 300;

    let newY = 50;
    const nodeHeight = 100;
    const occupiedYPositions = existingNodes
      .filter(n => n.pos_x >= maxX - 100)
      .map(n => n.pos_y)
      .sort((a, b) => a - b);

    for (let i = 0; i < occupiedYPositions.length; i++) {
      if (occupiedYPositions[i] > newY + nodeHeight) break;
      newY = occupiedYPositions[i] + nodeHeight + 20;
    }

    const html = `
      <div class="drawflow_node_header bg-orange-500 text-white px-3 py-2 rounded-t-lg font-medium">
        🔗 Логика
      </div>
      <div class="px-3 py-2 text-sm">
        <div class="mb-2">
          <label class="block text-xs text-gray-600 mb-1">Тип:</label>
          <select class="w-full px-2 py-1 border rounded text-xs logic-type-select bg-white">
            <option value="and">И (AND)</option>
            <option value="or">ИЛИ (OR)</option>
          </select>
        </div>
      </div>
    `;

    try {
      // 2 inputs, 1 output
      editor.addNode('logic', 2, 1, maxX + 50, newY, 'logic', { logic_type: 'and' }, html, false);
      console.log('✓ Логический узел добавлен');
    } catch (error) {
      console.error('✗ Ошибка добавления логического узла:', error);
    }
  };

  const handleSave = async () => {
    if (!editorRef.current) return;

    setSaving(true);
    try {
      const token = localStorage.getItem('token');
      const exportedData = editorRef.current.export();
      if (!exportedData || typeof exportedData !== 'object') {
        alert('Ошибка экспорта данных редактора');
        setSaving(false);
        return;
      }

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

  // Загрузка необходимых данных при монтировании
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

      let parsedFlowData = scenario.flow_data;
      if (typeof scenario.flow_data === 'string') {
        try {
          parsedFlowData = JSON.parse(scenario.flow_data);
        } catch (e) {
          console.error('Ошибка парсинга flow_data:', e);
          parsedFlowData = null;
        }
      }

      if (scenario.build_id) {
        window.currentBuildDataRef = null;
        setCurrentBuildData(null);
        try {
          await loadBuildDataForReference(scenario.build_id);
          setFlowData(parsedFlowData);
          setHasSelectedBuild(true);
        } catch (err) {
          console.error('Не удалось загрузить сборку:', err);
          setLoading(false);
          return;
        }
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

  return React.createElement('div', { className: 'container mx-auto p-6' },
    React.createElement('div', { className: 'bg-white rounded-lg shadow-md p-6' },
      React.createElement('h2', { className: 'text-xl font-bold mb-4 text-gray-800' },
        scenarioId ? 'Редактировать сценарий' : 'Создать сценарий'
      ),
      React.createElement('form', { onSubmit: (e) => e.preventDefault() },
        React.createElement('div', { className: 'mb-4' },
          React.createElement('label', { className: 'block text-sm font-medium text-gray-700 mb-1', htmlFor: 'human_name' }, 'Название'),
          React.createElement('input', { type: 'text', id: 'human_name', value: humanName, onChange: (e) => setHumanName(e.target.value), className: 'w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500', required: true })
        ),
        React.createElement('div', { className: 'mb-4' },
          React.createElement('label', { className: 'block text-sm font-medium text-gray-700 mb-1', htmlFor: 'machine_name' }, 'Машинное имя'),
          React.createElement('input', { type: 'text', id: 'machine_name', value: machineName, onChange: (e) => setMachineName(e.target.value), className: 'w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500', required: true })
        ),
        React.createElement('div', { className: 'mb-6' },
          React.createElement('label', { className: 'block text-sm font-medium text-gray-700 mb-1', htmlFor: 'build_id' }, 'Сборка'),
          React.createElement('select', {
            id: 'build_id',
            value: selectedBuildId,
            onChange: (e) => {
              const val = e.target.value;
              setSelectedBuildId(val);
              if (val) {
                window.currentBuildDataRef = null;
                setCurrentBuildData(null);
                isImportDone.current = false;
                loadBuildDataForReference(val);
              } else {
                setHasSelectedBuild(false);
                window.currentBuildDataRef = null;
                setCurrentBuildData(null);
              }
            },
            className: 'w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500',
            required: true
          },
            React.createElement('option', { value: '' }, 'Выберите сборку'),
            builds.map(build => React.createElement('option', { key: build.id, value: build.id }, build.human_name))
          )
        ),
        React.createElement('div', { className: 'mb-6' },
          React.createElement('div', { className: 'flex items-center justify-between mb-2' },
            React.createElement('h3', { className: 'text-lg font-semibold text-gray-800' }, 'Визуальный редактор'),
            React.createElement('div', { className: 'flex space-x-2' },
              React.createElement('button', { type: 'button', onClick: addDataNode, disabled: !hasSelectedBuild, className: `px-3 py-1 bg-blue-500 text-white text-sm rounded hover:bg-blue-600 focus:outline-none ${!hasSelectedBuild ? 'opacity-50 cursor-not-allowed' : ''}` }, '+ Данные'),
              React.createElement('button', { type: 'button', onClick: addActionNode, disabled: !hasSelectedBuild, className: `px-3 py-1 bg-green-500 text-white text-sm rounded hover:bg-green-600 focus:outline-none ${!hasSelectedBuild ? 'opacity-50 cursor-not-allowed' : ''}` }, '+ Действия'),
              React.createElement('button', { type: 'button', onClick: addConditionNode, disabled: !hasSelectedBuild, className: `px-3 py-1 bg-purple-600 text-white text-sm rounded hover:bg-purple-700 focus:outline-none ${!hasSelectedBuild ? 'opacity-50 cursor-not-allowed' : ''}` }, '+ Условие'),
              React.createElement('button', { type: 'button', onClick: addLogicNode, disabled: !hasSelectedBuild, className: `px-3 py-1 bg-orange-500 text-white text-sm rounded hover:bg-orange-600 focus:outline-none ${!hasSelectedBuild ? 'opacity-50 cursor-not-allowed' : ''}` }, '+ Логика')
            )
          ),
          React.createElement('div', { className: `drawflow-wrapper ${!hasSelectedBuild && !flowData ? 'pointer-events-none opacity-50' : ''}` },
            React.createElement('div', { ref: drawflowContainerRef, id: 'drawflow', className: '' })
          )
        ),
        React.createElement('div', { className: 'mb-6 flex items-center' },
          React.createElement('label', { className: 'flex items-center cursor-pointer' },
            React.createElement('div', { className: 'relative' },
              React.createElement('input', { type: 'checkbox', className: 'sr-only', checked: isActive, onChange: (e) => setIsActive(e.target.checked) }),
              React.createElement('div', { className: `block w-14 h-8 rounded-full transition-colors ${isActive ? 'bg-green-600' : 'bg-gray-300'}` }),
              React.createElement('div', { className: `absolute left-1 top-1 bg-white w-6 h-6 rounded-full transition-transform ${isActive ? 'translate-x-6' : ''}` })
            ),
            React.createElement('span', { className: 'ml-3 text-sm font-medium text-gray-700' }, 'Глобально включен')
          )
        ),
        React.createElement('div', { className: 'flex justify-end space-x-2' },
          React.createElement('button', {
            type: 'button',
            onClick: onClose ? onClose : () => {
              window.history.pushState({}, '', '/');
              window.dispatchEvent(new Event('popstate'));
            },
            className: 'px-4 py-2 text-gray-700 bg-gray-200 rounded hover:bg-gray-300 focus:outline-none'
          }, 'Отмена'),
          React.createElement('button', {
            type: 'button',
            onClick: handleSave,
            disabled: saving,
            className: 'px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-50'
          }, saving ? 'Сохранение...' : 'Сохранить')
        )
      )
    )
  );
}

const ScenarioEditor = React.memo(ScenarioEditorComponent, (prev, next) => {
  return prev.scenarioId === next.scenarioId && prev.onClose === next.onClose;
});

window.ScenarioEditor = ScenarioEditor;
console.log('ScenarioEditor.jsx: Экспортирован', window.ScenarioEditor);