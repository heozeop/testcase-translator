import React from 'react';

const InputCollectionProgress: React.FC<any> = () => {
  return (
    <div className="p-4 border rounded-lg">
      <h3 className="text-lg font-semibold mb-2">Input Collection Progress</h3>
      <p>This component is temporarily simplified for Docker development.</p>
      <div className="w-full bg-gray-200 rounded-full h-2.5 mt-2">
        <div className="bg-blue-600 h-2.5 rounded-full" style={{width: '45%'}}></div>
      </div>
    </div>
  );
};

export default InputCollectionProgress;