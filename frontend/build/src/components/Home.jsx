console.log('Loading Home.jsx...');

if (!window.React) {
  console.error('Home.jsx: React not loaded');
  throw new Error('React not loaded');
}

const React = window.React;
const { useState } = React;

function Home({ onAddAssembly }) {
  console.log('Home.jsx: Rendering');
  const [isAddClicked, setIsAddClicked] = useState(false);

  const handleAddClick = () => {
    console.log('Home.jsx: Add Assembly button clicked');
    setIsAddClicked(true);
    if (onAddAssembly) {
      console.log('Home.jsx: Calling onAddAssembly');
      onAddAssembly();
    } else {
      console.error('Home.jsx: onAddAssembly prop is not defined');
    }
  };

  return React.createElement(
    'div',
    { className: 'flex flex-col items-center justify-center min-h-screen bg-gray-100' },
    React.createElement(
      'div',
      { className: 'text-center' },
      React.createElement('h1', { className: 'text-3xl font-bold text-blue-600 mb-4' }, 'Добавить сборку'),
      React.createElement(
        'button',
        {
          onClick: handleAddClick,
          className: 'bg-blue-600 text-white py-2 px-4 rounded hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500'
        },
        'Добавить'
      ),
      
    )
  );
}

window.Home = Home;
console.log('Home.jsx: Home exported:', window.Home);