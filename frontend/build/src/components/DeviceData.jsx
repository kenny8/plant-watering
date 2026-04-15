console.log('Loading DeviceData.jsx...');

if (!window.React || !window.AuthContext) {
  console.error('DeviceData.jsx: React or AuthContext not loaded');
  throw new Error('React or AuthContext not loaded');
}

const React = window.React;
const { useState, useEffect } = React;
const { useAuth } = window.AuthContext;

function DeviceData() {
  console.log('DeviceData.jsx: Rendering');
  const { token } = useAuth();
  const [device, setDevice] = useState(null);
  const [deviceData, setDeviceData] = useState([]);
  const [build, setBuild] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  // Получаем deviceId из URL
  const getDeviceIdFromUrl = () => {
    const path = window.location.pathname;
    const match = path.match(/\/device-data\/(\d+)/);
    return match ? parseInt(match[1]) : null;
  };

  useEffect(() => {
    const deviceId = getDeviceIdFromUrl();
    if (!deviceId) {
      setError('ID устройства не найден в URL');
      setLoading(false);
      return;
    }

    if (!token) {
      setError('Ошибка: Вы не авторизованы');
      setLoading(false);
      return;
    }

    console.log(`DeviceData.jsx: Loading data for device ${deviceId}`);
    
    // Загружаем данные устройства
    Promise.all([
      window.axios.get('/api/devices', { headers: { Authorization: `Bearer ${token}` } }),
      window.axios.get('/api/builds', { headers: { Authorization: `Bearer ${token}` } }),
      window.axios.get(`/api/devices/${deviceId}/data`, { headers: { Authorization: `Bearer ${token}` } })
    ])
    .then(([devicesResponse, buildsResponse, dataResponse]) => {
      // Находим текущее устройство
      const currentDevice = devicesResponse.data.find(d => d.id === deviceId);
      if (!currentDevice) {
        throw new Error('Устройство не найдено');
      }
      setDevice(currentDevice);

      // Находим сборку устройства
      const currentBuild = buildsResponse.data.find(b => b.id === currentDevice.build_id);
      setBuild(currentBuild);

      // Обрабатываем данные устройства
      const formattedData = [];
      Object.entries(dataResponse.data.data || {}).forEach(([timestamp, fields]) => {
        Object.entries(fields).forEach(([fieldName, fieldValue]) => {
          formattedData.push({
            id: `${timestamp}-${fieldName}`,
            field_name: fieldName,
            field_value: fieldValue,
            created_at: timestamp
          });
        });
      });
      
      // Сортируем по времени (новые сверху)
      formattedData.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
      setDeviceData(formattedData);

      setLoading(false);
    })
    .catch((error) => {
      console.error('DeviceData.jsx: Load failed:', error.response?.data || error.message);
      setError('Ошибка при загрузке данных устройства');
      setLoading(false);
    });
  }, [token]);

  const handleBack = () => {
    window.history.pushState({}, '', '/devices');
    window.dispatchEvent(new PopStateEvent('popstate'));
  };

  if (loading) {
    return React.createElement(
      'div',
      { className: 'flex items-center justify-center min-h-screen bg-gray-100' },
      React.createElement('div', { className: 'text-xl' }, 'Загрузка данных...')
    );
  }

  if (error) {
    return React.createElement(
      'div',
      { className: 'flex flex-col items-center min-h-screen bg-gray-100 py-8' },
      React.createElement(
        'div',
        { className: 'w-full max-w-4xl' },
        React.createElement('p', { className: 'text-red-500 text-center mb-4' }, error),
        React.createElement(
          'button',
          {
            onClick: handleBack,
            className: 'bg-blue-600 text-white py-2 px-4 rounded hover:bg-blue-700'
          },
          'Назад к устройствам'
        )
      )
    );
  }

  return React.createElement(
    'div',
    { className: 'flex flex-col items-center min-h-screen bg-gray-100 py-8' },
    React.createElement(
      'div',
      { className: 'w-full max-w-6xl' },
      
      // Заголовок
      React.createElement('h1', { 
        className: 'text-3xl font-bold text-center text-blue-600 mb-8' 
      }, 'Данные устройства'),
      
      // Таблица информации об устройстве
      React.createElement(
        'div',
        { className: 'mb-8' },
        React.createElement('h2', { 
          className: 'text-xl font-semibold text-gray-700 mb-4' 
        }, 'Информация об устройстве'),
        React.createElement(
          'div',
          { className: 'bg-white shadow-md rounded-lg overflow-hidden' },
          React.createElement(
            'table',
            { className: 'w-full' },
            React.createElement(
              'tbody',
              null,
              [
                ['ID устройства', device.id],
                ['Человеческое имя', device.human_name || '—'],
                ['Машинное имя', `ID: ${device.id}`],
                ['Сборка (человеческое)', build?.human_name || '—'],
                ['Сборка (машинное)', build?.machine_name || '—'],
                ['Время создания', new Date(device.created_at).toLocaleString('ru-RU')],
                ['Последняя активность', new Date(device.last_seen).toLocaleString('ru-RU')]
              ].map(([label, value], index) =>
                React.createElement(
                  'tr',
                  { 
                    key: label,
                    className: index % 2 === 0 ? 'bg-gray-50' : 'bg-white' 
                  },
                  React.createElement(
                    'td', 
                    { 
                      className: 'py-3 px-4 font-semibold text-gray-700 border-b' 
                    }, 
                    label
                  ),
                  React.createElement(
                    'td', 
                    { 
                      className: 'py-3 px-4 border-b' 
                    }, 
                    value
                  )
                )
              )
            )
          )
        )
      ),
      
      // Таблица данных устройства
      React.createElement(
        'div',
        { className: 'mb-8' },
        React.createElement('h2', { 
          className: 'text-xl font-semibold text-gray-700 mb-4' 
        }, `Переданные данные (${deviceData.length} записей)`),
        deviceData.length === 0
          ? React.createElement('p', { className: 'text-gray-600 text-center' }, 'Данные отсутствуют')
          : React.createElement(
              'table',
              { className: 'w-full bg-white shadow-md rounded-lg overflow-hidden' },
              React.createElement(
                'thead',
                { className: 'bg-blue-600 text-white' },
                React.createElement(
                  'tr',
                  null,
                  React.createElement('th', { className: 'py-3 px-4 text-left' }, '№'),
                  React.createElement('th', { className: 'py-3 px-4 text-left' }, 'Показание (машинное)'),
                  React.createElement('th', { className: 'py-3 px-4 text-left' }, 'Значение'),
                  React.createElement('th', { className: 'py-3 px-4 text-left' }, 'Время записи')
                )
              ),
              React.createElement(
                'tbody',
                null,
                deviceData.map((record, index) =>
                  React.createElement(
                    'tr',
                    { key: record.id, className: 'border-t hover:bg-gray-50' },
                    React.createElement('td', { className: 'py-3 px-4' }, index + 1),
                    React.createElement('td', { className: 'py-3 px-4 font-mono' }, record.field_name),
                    React.createElement('td', { className: 'py-3 px-4' }, record.field_value),
                    React.createElement('td', { className: 'py-3 px-4 text-sm' }, 
                      new Date(record.created_at).toLocaleString('ru-RU')
                    )
                  )
                )
              )
            )
      ),
      
      // Кнопка назад
      React.createElement(
        'div',
        { className: 'text-center' },
        React.createElement(
          'button',
          {
            onClick: handleBack,
            className: 'bg-blue-600 text-white py-2 px-6 rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 text-lg'
          },
          'Назад к устройствам'
        )
      )
    )
  );
}

window.DeviceData = DeviceData;
console.log('DeviceData.jsx: DeviceData exported:', window.DeviceData);