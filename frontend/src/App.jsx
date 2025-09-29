import Home from './Pagine/Home';
import { Routes, Route } from 'react-router-dom';
// import Generator from './Pagine/New_Generator';
import Generator from './Pagine/Generator';
import Index from './Pagine/Index';
import Histogram from './Pagine/Histogram';
import RangeQuery from './Pagine/RangeQuery';
import RankDiff from './Pagine/RankDiff';
import Augmentation from './Pagine/Augmentation';
import FractalDimension from './Pagine/FractalDimension';

function App() {
  // console.log("App - Render");
  return (
    <main className='main-content'>
      <Routes>
        <Route path='/' element={<Home/>}/>
        <Route path='/generator' element={<Generator/>}/>
        <Route path='/index' element={<Index/>}/>
        <Route path='/histogram' element={<Histogram/>}/>
        <Route path='range' element={<RangeQuery/>}/>
        <Route path='/rank' element={<RankDiff/>}/>
        <Route path='/augmentation' element={<Augmentation/>}/>
        <Route path='/fractal' element={<FractalDimension/>}/>
      </Routes>
    </main>
  );
}

export default App;