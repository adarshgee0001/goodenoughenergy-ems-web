import { Routes, Route } from 'react-router-dom';
import { PublicLayout } from './components/layout/PublicLayout';
import { ScrollToTop } from './components/layout/ScrollToTop';

// Pages
import HomePage from './pages/Home/HomePage';
import ProductsIndexPage from './pages/Products/ProductsIndexPage';
import ProductDetailPage from './pages/Products/ProductDetailPage';
import EMSPage from './pages/EMS/EMSPage';
import SolutionsPage from './pages/Solutions/SolutionsPage';
import AboutPage from './pages/About/AboutPage';
import ResourcesPage from './pages/Resources/ResourcesPage';
import ContactPage from './pages/Contact/ContactPage';
import LoginPage from './pages/Login/LoginPage';

function App() {
  return (
    <>
      <ScrollToTop />
      <Routes>
      <Route path="/" element={<PublicLayout />}>
        <Route index element={<HomePage />} />
        <Route path="products">
          <Route index element={<ProductsIndexPage />} />
          <Route path=":productId" element={<ProductDetailPage />} />
        </Route>
        <Route path="ems" element={<EMSPage />} />
        <Route path="solutions" element={<SolutionsPage />} />
        <Route path="about" element={<AboutPage />} />
        <Route path="resources" element={<ResourcesPage />} />
        <Route path="contact" element={<ContactPage />} />
        <Route path="login" element={<LoginPage />} />
      </Route>
    </Routes>
    </>
  );
}

export default App;
