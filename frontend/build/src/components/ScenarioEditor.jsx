console.log('Loading ScenarioEditor.jsx...');

if (!window.React || !window.axios) {
  console.error('ScenarioEditor.jsx: React or axios not loaded');
  throw new Error('React or axios not loaded');
}

const React = window.React;
const { useState, useEffect, useRef } = React;
const axios = window.axios;

function ScenarioEditor({ scenarioId, onClose }) {
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

  // 🔥 ЕДИНСТВЕННАЯ ИНИЦИАЛИЗАЦИЯ
  useEffect(() => {
    let timer;

    const init = () => {
      if (!drawflowContainerRef.current || !window.Drawflow) {
        timer = setTimeout(init, 100);
        return;
      }

      try {
        // ВАЖНО: чистим контейнер
        drawflowContainerRef.current.innerHTML = '';

        const editor = new window.Drawflow(drawflowContainerRef.current);
        editorRef.current = editor;

        editor.reroute = true;
        editor.reroute_fix_curvature = true;

        editor.start();

        // ВАЖНО: модуль
        editor.addModule('default');
        editor.changeModule('default');

        console.log('✅ Drawflow initialized');

        if (flowData) {
          editor.import(flowData);
        }

      } catch (e) {
        console.error('Drawflow init error:', e);
      }
    };

    init();

    return () => {
      if (timer) clearTimeout(timer);

      if (editorRef.current?.stop) {
        editorRef.current.stop();
      }

      editorRef.current = null;

      if (drawflowContainerRef.current) {
        drawflowContainerRef.current.innerHTML = '';
      }
    };
  }, []);

  // загрузка нод из build
  useEffect(() => {
    if (buildId && editorRef.current) {
      loadBuildAndCreateNodes(buildId);
    }
  }, [buildId]);

  useEffect(() => {
    if (flowData && editorRef.current) {
      editorRef.current.import(flowData);
    }
  }, [flowData]);

  const fetchBuilds = async () => {
    const token = localStorage.getItem('token');
    const res = await axios.get('/api/builds', {
      headers: { Authorization: `Bearer ${token}` }
    });
    setBuilds(res.data.builds || res.data || []);
  };

  const loadBuildAndCreateNodes = async (id) => {
    const token = localStorage.getItem('token');
    const res = await axios.get(`/api/builds/${id}`, {
      headers: { Authorization: `Bearer ${token}` }
    });

    const build = res.data.build || res.data;
    if (!build) return;

    const editor = editorRef.current;

    let x = 50;
    let y = 50;

    build.post_fields?.forEach((f, i) => {
      editor.addNode(
        'trigger', 1, 1,
        x, y + i * 150,
        f.field_name,
        {},
        `<div>📡 ${f.name || f.field_name}</div>`,
        'trigger'
      );
    });

    x += 250;

    build.get_fields?.forEach((f, i) => {
      editor.addNode(
        'action', 1, 1,
        x, y + i * 150,
        f.field_name,
        {},
        `<div>⚙️ ${f.name || f.field_name}</div>`,
        'action'
      );
    });
  };

  const addNode = (name, data = {}, html = '<div>Node</div>', y = 50) => {
    const editor = editorRef.current;
    if (!editor) return;

    editor.addNode(name, 1, 1, 400, y, name, data, html, name);
  };

  const handleSave = async () => {
    if (!editorRef.current) return;

    const token = localStorage.getItem('token');

    const payload = {
      human_name: humanName,
      machine_name: machineName,
      build_id: parseInt(buildId),
      flow_data: JSON.stringify(editorRef.current.export()),
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
  };

  useEffect(() => {
    fetchBuilds();
    if (scenarioId) fetchScenario(scenarioId);
    else setLoading(false);
  }, []);

  const fetchScenario = async (id) => {
    const token = localStorage.getItem('token');

    const res = await axios.get(`/api/scenarios/${id}`, {
      headers: { Authorization: `Bearer ${token}` }
    });

    const s = res.data.scenario || res.data;

    setHumanName(s.human_name || '');
    setMachineName(s.machine_name || '');
    setBuildId(s.build_id || '');
    setFlowData(typeof s.flow_data === 'string' ? JSON.parse(s.flow_data) : s.flow_data);
    setIsActive(s.is_active ?? true);
    setLoading(false);
  };

  if (loading) return React.createElement('div', null, 'Loading...');

  return React.createElement('div', { className: 'p-6' },

    React.createElement('input', {
      value: humanName,
      onChange: e => setHumanName(e.target.value),
      placeholder: 'Название'
    }),

    React.createElement('select', {
      value: buildId,
      onChange: e => setBuildId(e.target.value)
    },
      React.createElement('option', { value: '' }, 'Выбери билд'),
      builds.map(b =>
        React.createElement('option', { key: b.id, value: b.id }, b.human_name)
      )
    ),

    React.createElement('div', {
      ref: drawflowContainerRef,
      style: { height: '600px', border: '1px solid #ccc', marginTop: '10px' }
    }),

    React.createElement('button', { onClick: () => addNode('condition') }, '+ Condition'),
    React.createElement('button', { onClick: () => addNode('time', {}, '<div>🕐</div>', 200) }, '+ Time'),

    React.createElement('button', { onClick: handleSave }, 'Save')
  );
}

window.ScenarioEditor = ScenarioEditor;
