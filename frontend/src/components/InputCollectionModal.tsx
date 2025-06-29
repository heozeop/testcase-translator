import React from 'react';

const InputCollectionModal: React.FC<any> = () => {
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg p-6 max-w-md w-full">
        <h2 className="text-xl font-bold mb-4">Input Collection</h2>
        <p className="mb-4">This component is temporarily simplified for Docker development.</p>
        <button className="bg-blue-500 text-white px-4 py-2 rounded">
          OK
        </button>
      </div>
    </div>
  );
};

export default InputCollectionModal;