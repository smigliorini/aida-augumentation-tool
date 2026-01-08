import MyMenu from '../Components/MyMenu';
import {Divider} from 'primereact/divider';
import FileExplorer from '../Components/FileExplorer';

function Home() {

  return (
    <>
      <MyMenu></MyMenu>
      <Divider/>
      <FileExplorer/>
    </>
  );
}

export default Home;