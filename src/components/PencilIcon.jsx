export default function PencilIcon({ size = 14, color = '#f59e0b', style = {}, onClick }) {
  return (
    <span
      onClick={onClick}
      style={{ display:'inline-flex', alignItems:'center', justifyContent:'center',
               cursor: onClick ? 'pointer' : 'default', flexShrink:0, ...style }}>
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill={color}
        xmlns="http://www.w3.org/2000/svg">
        {/* Pencil body */}
        <path d="M20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/>
        <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25z" opacity="0.85"/>
      </svg>
    </span>
  )
}
