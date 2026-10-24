import { useEffect, useState } from 'react'
import ConfirmDialog from './ConfirmDialog'
import { settleDialog, subscribeDialogs } from '../utils/dialog'

// Menampilkan dialog dari confirmDialog()/alertDialog() satu per satu.
export default function DialogHost() {
  const [queue, setQueue] = useState([])
  useEffect(() => subscribeDialogs(setQueue), [])
  const d = queue[0]
  if (!d) return null
  const { key, resolve: _resolve, ...props } = d
  return (
    <ConfirmDialog
      key={key}
      {...props}
      onConfirm={() => settleDialog(key, true)}
      onCancel={() => settleDialog(key, false)}
    />
  )
}
