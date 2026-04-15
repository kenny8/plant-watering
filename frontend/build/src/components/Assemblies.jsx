
console.log('Loading Assemblies.jsx...');

if (!window.React || !window.AuthContext) {
  console.error('Assemblies.jsx: React or AuthContext not loaded');
  throw new Error('React or AuthContext not loaded');
}

const React = window.React;
const { useState, useEffect } = React;
const { useAuth } = window.AuthContext;

function Assemblies({ onEditBuild }) {
  console.log('Assemblies.jsx: Rendering');
  const { token } = useAuth();
  const [builds, setBuilds] = useState([]);
  const [error, setError] = useState('');

  useEffect(() => {
    console.log('Assemblies.jsx: Fetching builds');
    if (!token) {
      console.error('Assemblies.jsx: No auth token available');
      setError('Ошибка: Вы не авторизованы');
      return;
    }

    window.axios
      .get('/api/builds', { headers: { Authorization: `Bearer ${token}` } })
      .then((response) => {
        console.log('Assemblies.jsx: Builds fetched:', response.data);
        setBuilds(response.data);
      })
      .catch((error) => {
        console.error('Assemblies.jsx: Fetch failed:', error.response?.data || error.message);
        setError('Ошибка при загрузке сборок');
      });
  }, [token]);

  const handleDelete = async (id) => {
    console.log(`Assemblies.jsx: Delete button clicked for build id ${id}`);
    if (!token) {
      console.error('Assemblies.jsx: No auth token available');
      setError('Ошибка: Вы не авторизованы');
      return;
    }

    try {
      await window.axios.delete(`/api/builds/${id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      console.log('Assemblies.jsx: Build deleted successfully');
      setBuilds(builds.filter(build => build.id !== id));
    } catch (error) {
      console.error('Assemblies.jsx: Delete failed:', error.response?.data || error.message);
      setError('Ошибка при удалении сборки');
    }
  };

  const handleEdit = (build) => {
    console.log('Assemblies.jsx: Edit button clicked for build:', build);
    if (onEditBuild) {
      onEditBuild(build);
    }
  };

  return React.createElement(
    'div',
    { className: 'flex flex-col items-center min-h-screen bg-gray-100 py-8' },
    React.createElement(
      'div',
      { className: 'w-full max-w-4xl' },
      React.createElement('h1', { className: 'text-2xl font-bold text-center text-blue-600 mb-6' }, 'Сборки'),
      error && React.createElement('p', { className: 'text-red-500 text-center mb-4' }, error),
      builds.length === 0 && !error
        ? React.createElement('p', { className: 'text-gray-600 text-center' }, 'Сборки отсутствуют')
        : React.createElement(
            'table',
            { className: 'w-full bg-white shadow-md rounded-lg overflow-hidden' },
            React.createElement(
              'thead',
              { className: 'bg-blue-600 text-white' },
              React.createElement(
                'tr',
                null,
                React.createElement('th', { className: 'py-3 px-4 text-left' }, 'ID'),
                React.createElement('th', { className: 'py-3 px-4 text-left' }, 'Название сборки'),
                React.createElement('th', { className: 'py-3 px-4 text-left' }, 'Машинное имя'),
                React.createElement('th', { className: 'py-3 px-4 text-left' }, 'Действия')
              )
            ),
            React.createElement(
              'tbody',
              null,
              builds.map((build) =>
                React.createElement(
                  'tr',
                  { key: build.id, className: 'border-t hover:bg-gray-50' },
                  React.createElement('td', { className: 'py-3 px-4' }, build.id),
                  React.createElement('td', { className: 'py-3 px-4' }, build.human_name),
                  React.createElement('td', { className: 'py-3 px-4' }, build.machine_name),
                  React.createElement(
                    'td',
                    { className: 'py-3 px-4 flex space-x-2' },
                    React.createElement(
                      'button',
                      {
                        onClick: () => handleEdit(build),
                        className: 'bg-green-600 text-white py-1 px-3 rounded hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 transition duration-200'
                      },
                      'Редактировать'
                    ),
                    React.createElement(
                      'button',
                      {
                        onClick: () => handleDelete(build.id),
                        className: 'bg-red-600 text-white py-1 px-3 rounded hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 transition duration-200'
                      },
                      'Удалить'
                    )
                  )
                )
              )
            )
          )
    )
  );
}

window.Assemblies = Assemblies;
console.log('Assemblies.jsx: Assemblies exported:', window.Assemblies);
