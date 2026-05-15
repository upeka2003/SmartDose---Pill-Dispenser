import React, { createContext, useContext, useState } from 'react';

type NotificationContextType = {
  hasUnread: boolean;
  setHasUnread: (val: boolean) => void;
};

const NotificationContext = createContext<NotificationContextType>({
  hasUnread: true,
  setHasUnread: () => {},
});

export function NotificationProvider({ children }: { children: React.ReactNode }) {
  const [hasUnread, setHasUnread] = useState(true);
  return (
    <NotificationContext.Provider value={{ hasUnread, setHasUnread }}>
      {children}
    </NotificationContext.Provider>
  );
}

export const useNotifications = () => useContext(NotificationContext);