console.log('Loading CreateBuild.jsx...');

if (!window.React || !window.AuthContext) {
  console.error('CreateBuild.jsx: React or AuthContext not loaded');
  throw new Error('React or AuthContext not loaded');
}

const React = window.React;
const { useState, useEffect } = React;
const { useAuth } = window.AuthContext;

function Step1({ onNext, onCancel, build, setBuild }) {
  console.log('Step1: Rendering');
  return React.createElement(
    'div',
    { className: 'p-4' },
    React.createElement('h2', { className: 'text-xl font-bold text-blue-600 mb-4' }, 'Имя сборки'),
    React.createElement(
      'div',
      { className: 'mb-4' },
      React.createElement('label', { className: 'block text-gray-700 text-sm font-bold mb-2' }, 'Человеческое имя'),
      React.createElement('input', {
        type: 'text',
        value: build.human_name,
        onChange: (e) => setBuild({ ...build, human_name: e.target.value }),
        className: 'w-full px-3 py-2 border rounded focus:outline-none focus:ring-2 focus:ring-blue-500',
        placeholder: 'Введите человеческое имя'
      })
    ),
    React.createElement(
      'div',
      { className: 'mb-4' },
      React.createElement('label', { className: 'block text-gray-700 text-sm font-bold mb-2' }, 'Машинное имя'),
      React.createElement('input', {
        type: 'text',
        value: build.machine_name,
        onChange: (e) => setBuild({ ...build, machine_name: e.target.value }),
        className: 'w-full px-3 py-2 border rounded focus:outline-none focus:ring-2 focus:ring-blue-500',
        placeholder: 'Введите машинное имя'
      })
    ),
    React.createElement(
      'div',
      { className: 'flex justify-end space-x-4' },
      React.createElement(
        'button',
        {
          onClick: () => {
            console.log('Step1: Cancel clicked');
            onCancel();
          },
          className: 'px-4 py-2 bg-gray-300 text-gray-700 rounded hover:bg-gray-400'
        },
        'Отмена'
      ),
      React.createElement(
        'button',
        {
          onClick: () => {
            console.log('Step1: Next clicked');
            onNext();
          },
          className: 'px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700'
        },
        'Далее'
      )
    )
  );
}

function Step2({ onNext, onBack, build, setBuild }) {
  console.log('Step2: Rendering');
  const addPostField = () => {
    console.log('Step2: Adding post field');
    setBuild({
      ...build,
      post_fields: [...build.post_fields, { human_name: '', machine_name: '', type: 'text' }],
    });
  };

  const removePostField = (index) => {
    console.log('Step2: Removing post field at index', index);
    setBuild({
      ...build,
      post_fields: build.post_fields.filter((_, i) => i !== index),
    });
  };

  return React.createElement(
    'div',
    { className: 'p-4' },
    React.createElement('h2', { className: 'text-xl font-bold text-blue-600 mb-4' }, 'POST-запросы'),
    build.post_fields.map((field, index) =>
      React.createElement(
        'div',
        { key: index, className: 'flex mb-2' },
        React.createElement('input', {
          type: 'text',
          placeholder: 'Человеческое имя',
          value: field.human_name,
          onChange: (e) => {
            console.log('Step2: Updating post field human_name at index', index);
            const newFields = [...build.post_fields];
            newFields[index].human_name = e.target.value;
            setBuild({ ...build, post_fields: newFields });
          },
          className: 'flex-1 p-2 border rounded mr-2'
        }),
        React.createElement('input', {
          type: 'text',
          placeholder: 'Машинное имя',
          value: field.machine_name,
          onChange: (e) => {
            console.log('Step2: Updating post field machine_name at index', index);
            const newFields = [...build.post_fields];
            newFields[index].machine_name = e.target.value;
            setBuild({ ...build, post_fields: newFields });
          },
          className: 'flex-1 p-2 border rounded mr-2'
        }),
        React.createElement(
          'select',
          {
            value: field.type,
            onChange: (e) => {
              console.log('Step2: Updating post field type at index', index);
              const newFields = [...build.post_fields];
              newFields[index].type = e.target.value;
              setBuild({ ...build, post_fields: newFields });
            },
            className: 'p-2 border rounded mr-2'
          },
          React.createElement('option', { value: 'text' }, 'Текст'),
          React.createElement('option', { value: 'number' }, 'Число')
        ),
        build.post_fields.length > 1 &&
          React.createElement(
            'button',
            {
              onClick: () => removePostField(index),
              className: 'bg-red-600 text-white p-2 rounded'
            },
            '-'
          )
      )
    ),
    React.createElement(
      'button',
      {
        onClick: addPostField,
        className: 'bg-blue-600 text-white p-2 rounded mb-4'
      },
      '+'
    ),
    React.createElement(
      'div',
      { className: 'flex justify-end space-x-4' },
      React.createElement(
        'button',
        {
          onClick: () => {
            console.log('Step2: Back clicked');
            onBack();
          },
          className: 'px-4 py-2 bg-gray-300 text-gray-700 rounded hover:bg-gray-400'
        },
        'Назад'
      ),
      React.createElement(
        'button',
        {
          onClick: () => {
            console.log('Step2: Next clicked');
            onNext();
          },
          className: 'px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700'
        },
        'Далее'
      )
    )
  );
}

function Step3({ onNext, onBack, build, setBuild }) {
  console.log('Step3: Rendering');
  const addGetField = () => {
    console.log('Step3: Adding get field');
    setBuild({
      ...build,
      get_fields: [...build.get_fields, { 
        human_name: '', 
        machine_name: '', 
        bot_parameters: [{ 
          human_name: '', 
          machine_name: '',
          result: '' 
        }] 
      }],
    });
  };

  const removeGetField = (index) => {
    console.log('Step3: Removing get field at index', index);
    setBuild({
      ...build,
      get_fields: build.get_fields.filter((_, i) => i !== index),
    });
  };

  const addBotParameter = (getIndex) => {
    console.log('Step3: Adding bot parameter at get index', getIndex);
    const newFields = [...build.get_fields];
    newFields[getIndex].bot_parameters = [...newFields[getIndex].bot_parameters, { 
      human_name: '', 
      machine_name: '',
      result: '' 
    }];
    setBuild({ ...build, get_fields: newFields });
  };

  const removeBotParameter = (getIndex, paramIndex) => {
    console.log('Step3: Removing bot parameter at get index', getIndex, 'param index', paramIndex);
    const newFields = [...build.get_fields];
    newFields[getIndex].bot_parameters = newFields[getIndex].bot_parameters.filter((_, i) => i !== paramIndex);
    setBuild({ ...build, get_fields: newFields });
  };

  return React.createElement(
    'div',
    { className: 'p-4' },
    React.createElement('h2', { className: 'text-xl font-bold text-blue-600 mb-4' }, 'GET-запросы'),
    build.get_fields.map((field, index) =>
      React.createElement(
        'div',
        { key: index, className: 'mb-6 border-b pb-4' },
        React.createElement(
          'div',
          { className: 'flex mb-2' },
          React.createElement('input', {
            type: 'text',
            placeholder: 'Человеческое имя',
            value: field.human_name,
            onChange: (e) => {
              console.log('Step3: Updating get field human_name at index', index);
              const newFields = [...build.get_fields];
              newFields[index].human_name = e.target.value;
              setBuild({ ...build, get_fields: newFields });
            },
            className: 'flex-1 p-2 border rounded mr-2'
          }),
          React.createElement('input', {
            type: 'text',
            placeholder: 'Машинное имя',
            value: field.machine_name,
            onChange: (e) => {
              console.log('Step3: Updating get field machine_name at index', index);
              const newFields = [...build.get_fields];
              newFields[index].machine_name = e.target.value;
              setBuild({ ...build, get_fields: newFields });
            },
            className: 'flex-1 p-2 border rounded mr-2'
          }),
          build.get_fields.length > 1 &&
            React.createElement(
              'button',
              {
                onClick: () => removeGetField(index),
                className: 'bg-red-600 text-white p-2 rounded'
              },
              '-'
            )
        ),
        React.createElement('h3', { className: 'text-lg font-bold text-gray-700 mb-2' }, 'Параметры для бота'),
        field.bot_parameters.map((param, paramIndex) =>
          React.createElement(
            'div',
            { key: paramIndex, className: 'mb-4 ml-4 p-3 border rounded bg-gray-50' },
            // Верхняя строка: человеческое имя и машинное имя
            React.createElement(
              'div',
              { className: 'flex mb-2' },
              React.createElement('input', {
                type: 'text',
                placeholder: 'Человеческое имя (бот)',
                value: param.human_name,
                onChange: (e) => {
                  console.log('Step3: Updating bot parameter human_name at get index', index, 'param index', paramIndex);
                  const newFields = [...build.get_fields];
                  newFields[index].bot_parameters[paramIndex].human_name = e.target.value;
                  setBuild({ ...build, get_fields: newFields });
                },
                className: 'flex-1 p-2 border rounded mr-2'
              }),
              React.createElement('input', {
                type: 'text',
                placeholder: 'Машинное имя (бот)',
                value: param.machine_name,
                onChange: (e) => {
                  console.log('Step3: Updating bot parameter machine_name at get index', index, 'param index', paramIndex);
                  const newFields = [...build.get_fields];
                  newFields[index].bot_parameters[paramIndex].machine_name = e.target.value;
                  setBuild({ ...build, get_fields: newFields });
                },
                className: 'flex-1 p-2 border rounded mr-2'
              }),
              field.bot_parameters.length > 1 &&
                React.createElement(
                  'button',
                  {
                    onClick: () => removeBotParameter(index, paramIndex),
                    className: 'bg-red-600 text-white p-2 rounded'
                  },
                  '-'
                )
            ),
            // Нижняя строка: результат (занимает всю ширину)
            React.createElement(
              'div',
              { className: 'flex' },
              React.createElement('input', {
                type: 'text',
                placeholder: 'Результат',
                value: param.result,
                onChange: (e) => {
                  console.log('Step3: Updating bot parameter result at get index', index, 'param index', paramIndex);
                  const newFields = [...build.get_fields];
                  newFields[index].bot_parameters[paramIndex].result = e.target.value;
                  setBuild({ ...build, get_fields: newFields });
                },
                className: 'flex-1 p-2 border rounded'
              })
            )
          )
        ),
        React.createElement(
          'button',
          {
            onClick: () => addBotParameter(index),
            className: 'ml-4 bg-blue-600 text-white p-2 rounded mb-2'
          },
          '+'
        )
      )
    ),
    React.createElement(
      'button',
      {
        onClick: addGetField,
        className: 'bg-blue-600 text-white p-2 rounded mb-4'
      },
      '+'
    ),
    React.createElement(
      'div',
      { className: 'flex justify-end space-x-4' },
      React.createElement(
        'button',
        {
          onClick: () => {
            console.log('Step3: Back clicked');
            onBack();
          },
          className: 'px-4 py-2 bg-gray-300 text-gray-700 rounded hover:bg-gray-400'
        },
        'Назад'
      ),
      React.createElement(
        'button',
        {
          onClick: () => {
            console.log('Step3: Next clicked');
            onNext();
          },
          className: 'px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700'
        },
        'Далее'
      )
    )
  );
}

function Step4({ onSave, onBack, build }) {
  console.log('Step4: Rendering');
  const [postUrl, setPostUrl] = useState('');
  const [getUrl, setGetUrl] = useState('');

  useEffect(() => {
    console.log('Step4: Generating URLs for machine_name:', build.machine_name);
    setPostUrl(`/${build.machine_name}/{device_id}/post_endpoint`);
    setGetUrl(`/${build.machine_name}/{device_id}/get_endpoint`);
  }, [build]);

  return React.createElement(
    'div',
    { className: 'p-4' },
    React.createElement('h2', { className: 'text-xl font-bold text-blue-600 mb-4' }, 'Данные'),
    React.createElement(
      'div',
      { className: 'mb-4' },
      React.createElement('label', { className: 'block text-gray-700 text-sm font-bold mb-2' }, 'POST URL'),
      React.createElement('input', {
        type: 'text',
        value: postUrl,
        readOnly: true,
        className: 'w-full px-3 py-2 border rounded bg-gray-100'
      }),
      React.createElement(
        'button',
        {
          onClick: () => {
            console.log('Step4: Copying POST URL:', postUrl);
            navigator.clipboard.writeText(postUrl);
          },
          className: 'mt-2 bg-blue-600 text-white py-2 px-4 rounded hover:bg-blue-700'
        },
        'Копировать'
      )
    ),
    React.createElement(
      'div',
      { className: 'mb-4' },
      React.createElement('label', { className: 'block text-gray-700 text-sm font-bold mb-2' }, 'GET URL'),
      React.createElement('input', {
        type: 'text',
        value: getUrl,
        readOnly: true,
        className: 'w-full px-3 py-2 border rounded bg-gray-100'
      }),
      React.createElement(
        'button',
        {
          onClick: () => {
            console.log('Step4: Copying GET URL:', getUrl);
            navigator.clipboard.writeText(getUrl);
          },
          className: 'mt-2 bg-blue-600 text-white py-2 px-4 rounded hover:bg-blue-700'
        },
        'Копировать'
      )
    ),
    React.createElement(
      'div',
      { className: 'flex justify-end space-x-4' },
      React.createElement(
        'button',
        {
          onClick: () => {
            console.log('Step4: Back clicked');
            onBack();
          },
          className: 'px-4 py-2 bg-gray-300 text-gray-700 rounded hover:bg-gray-400'
        },
        'Назад'
      ),
      React.createElement(
        'button',
        {
          onClick: () => {
            console.log('Step4: Save clicked');
            onSave();
          },
          className: 'px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700'
        },
        'Сохранить'
      )
    )
  );
}

function CreateBuild({ onClose }) {
  console.log('CreateBuild.jsx: Rendering');
  const { token } = useAuth();
  const [step, setStep] = useState(1);
  const [build, setBuild] = useState({
    human_name: '',
    machine_name: '',
    post_fields: [{ human_name: '', machine_name: '', type: 'text' }],
    get_fields: [{ human_name: '', machine_name: '', bot_parameters: [{ human_name: '', machine_name: '', result: '' }] }],
  });
  const [error, setError] = useState('');

  const handleSave = async () => {
    console.log('CreateBuild: Saving build:', build);
    if (!token) {
      console.error('CreateBuild: No auth token available');
      setError('Ошибка: Вы не авторизованы');
      return;
    }

    try {
      const response = await window.axios.post('/api/builds', build, { headers: { Authorization: `Bearer ${token}` } });
      console.log('CreateBuild: Save response:', response.data);
      onClose();
    } catch (error) {
      console.error('CreateBuild: Save failed:', error.response?.data || error.message);
      setError('Ошибка при сохранении сборки');
    }
  };

  return React.createElement(
    'div',
    { className: 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center' },
    React.createElement(
      'div',
      { className: 'bg-white p-6 rounded-lg shadow-lg w-full max-w-2xl' },
      error && React.createElement('p', { className: 'text-red-500 text-center mb-4' }, error),
      React.createElement(
        'div',
        { className: 'max-h-[60vh] overflow-y-auto scrollbar-hide' },
        step === 1 && React.createElement(Step1, { onNext: () => setStep(2), onCancel: onClose, build, setBuild }),
        step === 2 && React.createElement(Step2, { onNext: () => setStep(3), onBack: () => setStep(1), build, setBuild }),
        step === 3 && React.createElement(Step3, { onNext: () => setStep(4), onBack: () => setStep(2), build, setBuild }),
        step === 4 && React.createElement(Step4, { onSave: handleSave, onBack: () => setStep(3), build })
      )
    )
  );
}

// Стили для скрытия полосы прокрутки
const style = document.createElement('style');
style.innerHTML = `
  .scrollbar-hide::-webkit-scrollbar {
    display: none;
  }
  .scrollbar-hide {
    -ms-overflow-style: none;
    scrollbar-width: none;
  }
`;
document.head.appendChild(style);

window.CreateBuild = CreateBuild;
console.log('CreateBuild.jsx: CreateBuild exported:', window.CreateBuild);