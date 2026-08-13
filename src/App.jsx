import { Routes, Route, Navigate } from 'react-router-dom'
import ForumLayout from './components/ai-forum/layout/ForumLayout.jsx'
import AdminLayout from './components/ai-forum/layout/AdminLayout.jsx'
import ForumHomePage from './pages/ai-forum/ForumHomePage.jsx'
import BoardsPage from './pages/ai-forum/BoardsPage.jsx'
import PostDetailPage from './pages/ai-forum/PostDetailPage.jsx'
import PostEditorPage from './pages/ai-forum/PostEditorPage.jsx'
import QaPage from './pages/ai-forum/QaPage.jsx'
import SearchPage from './pages/ai-forum/SearchPage.jsx'
import ProfilePage from './pages/ai-forum/ProfilePage.jsx'
import NotificationsPage from './pages/ai-forum/NotificationsPage.jsx'
import LoginPage from './pages/ai-forum/LoginPage.jsx'
import AdminDashboardPage from './pages/ai-forum/admin/AdminDashboardPage.jsx'
import ContentReviewPage from './pages/ai-forum/admin/ContentReviewPage.jsx'
import UserManagePage from './pages/ai-forum/admin/UserManagePage.jsx'
import BoardManagePage from './pages/ai-forum/admin/BoardManagePage.jsx'
import ReportHandlePage from './pages/ai-forum/admin/ReportHandlePage.jsx'
import OperationConfigPage from './pages/ai-forum/admin/OperationConfigPage.jsx'
import { AuthProvider } from './components/ai-forum/AuthProvider.jsx'

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        {/* 根路径自动跳转到论坛首页 */}
        <Route path="/" element={<Navigate to="/forum" replace />} />

        {/* AI 论坛前台路由 */}
        <Route path="/forum" element={<ForumLayout />}>
          <Route index element={<ForumHomePage />} />
          <Route path="boards" element={<BoardsPage />} />
          <Route path="post/:id" element={<PostDetailPage />} />
          <Route path="editor" element={<PostEditorPage />} />
          <Route path="qa" element={<QaPage />} />
          <Route path="search" element={<SearchPage />} />
          <Route path="profile" element={<ProfilePage />} />
          <Route path="notifications" element={<NotificationsPage />} />
          <Route path="login" element={<LoginPage />} />
        </Route>

        {/* AI 论坛后台路由 */}
        <Route path="/forum/admin" element={<AdminLayout />}>
          <Route index element={<AdminDashboardPage />} />
          <Route path="review" element={<ContentReviewPage />} />
          <Route path="users" element={<UserManagePage />} />
          <Route path="boards" element={<BoardManagePage />} />
          <Route path="reports" element={<ReportHandlePage />} />
          <Route path="config" element={<OperationConfigPage />} />
        </Route>
      </Routes>
    </AuthProvider>
  )
}
